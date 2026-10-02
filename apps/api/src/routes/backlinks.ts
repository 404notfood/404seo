// Backlink imports use a configured provider and expose failures explicitly.
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { fetchBacklinkProvider } from "../lib/backlinkProvider"
import { CmsError } from "../lib/cmsWordPress"
import { prisma } from "../lib/prisma.js"
import { requireRole, requireFeature, assertProjectOwner } from "../lib/guards.js"

// Domaine : lettres/chiffres/tirets + au moins un point (ex: example.com).
// Empêche d'injecter des chemins ou des caractères de contrôle dans l'URL d'API.
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

// Normalise une entrée en domaine nu : accepte aussi bien "https://www.exemple.com/path"
// que "exemple.com". Retire le protocole, un éventuel "www.", le port et le chemin.
// Retourne null si le résultat n'est pas un domaine valide.
function normalizeToDomain(input: string): string | null {
  let host = input.trim()
  // Si protocole présent, on s'appuie sur URL pour extraire le hostname.
  if (/^https?:\/\//i.test(host)) {
    try { host = new URL(host).hostname } catch { return null }
  } else {
    // Sinon, on retire un éventuel chemin/port collé au domaine.
    host = host.split("/")[0]!.split(":")[0]!
  }
  host = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "")
  return DOMAIN_REGEX.test(host) ? host : null
}

// On accepte une chaîne libre ici ; la normalisation + validation stricte se fait
// dans le handler (pour pouvoir renvoyer un message d'erreur clair).
const FetchBacklinksSchema = z.object({
  domain: z.string().min(3).max(2048),
  projectId: z.string().optional(),
})

const backlinksRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/backlinks — Liste des backlinks
  fastify.get<{ Querystring: { projectId?: string; domain?: string; page?: string } }>(
    "/api/backlinks",
    async (request, reply) => {
      const { projectId, domain, page: pageStr } = request.query
      const page = Math.min(10000, Math.max(1, parseInt(pageStr ?? "1", 10) || 1))
      const limit = 50

      if (projectId) {
        const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
        if (!project) return reply.status(403).send({ error: "Accès refusé" })
      }

      // Restreindre aux projets de l'utilisateur si pas de projectId
      let projectFilter: { projectId?: string | { in: string[] } } = {}
      if (projectId) {
        projectFilter = { projectId }
      } else {
        const userProjects = await prisma.project.findMany({
          where: { deletedAt: null, tenantId: request.tenantId, userId: request.userId },
          select: { id: true },
        })
        projectFilter = { projectId: { in: userProjects.map((p) => p.id) } }
      }

      const [items, total] = await Promise.all([
        prisma.backlink.findMany({
          where: {
            tenantId: request.tenantId,
            ...projectFilter,
            ...(domain ? { sourceDomain: { contains: domain } } : {}),
            isActive: true,
          },
          orderBy: [{ domainRating: "desc" }, { firstSeen: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.backlink.count({
          where: {
            tenantId: request.tenantId,
            ...projectFilter,
            ...(domain ? { sourceDomain: { contains: domain } } : {}),
            isActive: true,
          },
        }),
      ])

      // Stats agrégées
      const all = await prisma.backlink.findMany({
        where: { tenantId: request.tenantId, ...projectFilter, ...(domain ? { sourceDomain: { contains: domain } } : {}), isActive: true },
        select: { dofollow: true, domainRating: true, sourceDomain: true },
      })

      const uniqueDomains = new Set(all.map((b) => b.sourceDomain)).size
      const dofollow = all.filter((b) => b.dofollow).length
      const avgDR =
        all.length > 0
          ? Math.round(
              all.filter((b) => b.domainRating != null).reduce((s, b) => s + (b.domainRating ?? 0), 0) /
                Math.max(1, all.filter((b) => b.domainRating != null).length)
            )
          : 0

      return reply.send({
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        stats: {
          total,
          uniqueDomains,
          dofollow,
          nofollow: total - dofollow,
          avgDomainRating: avgDR,
        },
      })
    }
  )

  // POST /api/backlinks/fetch — Import bounded provider evidence for the client project
  fastify.post(
    "/api/backlinks/fetch",
    { preHandler: [requireRole("MEMBER"), requireFeature("backlinks")], config: { rateLimit: { max: 2, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parse = FetchBacklinksSchema.safeParse(request.body)
      if (!parse.success) return reply.status(400).send({ error: "Données invalides" })
      const { domain: rawDomain, projectId } = parse.data

      // Accepte une URL complète (https://www.exemple.com/...) ou un domaine nu.
      const domain = normalizeToDomain(rawDomain)
      if (!domain) {
        return reply.status(400).send({ error: "Domaine invalide (ex attendu : exemple.com)" })
      }

      if (projectId) {
        const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
        if (!project) return reply.status(403).send({ error: "Accès refusé" })
      }

      if (!projectId) throw new CmsError("Choisissez le projet client avant l’import.")
      const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
      if (!project || normalizeToDomain(project.domain) !== domain) throw new CmsError("Le domaine ne correspond pas à ce projet.")
      const imported = await fetchBacklinkProvider(domain)
      await prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', request.tenantId)
        const [tenant, user, currentProject] = await Promise.all([
          tx.tenant.findFirst({ where: { id: request.tenantId, isSuspended: false } }),
          tx.user.findFirst({ where: { id: request.userId, tenantId: request.tenantId, isBanned: false, role: { in: ["MEMBER", "ADMIN"] } } }),
          tx.project.findFirst({ where: { id: projectId, tenantId: request.tenantId, userId: request.userId, deletedAt: null } }),
        ])
        if (!tenant || !user || !currentProject) throw new CmsError("Accès à l’import refusé.", 403)
        for (const link of imported.backlinks) {
          const existing = await tx.backlink.findFirst({ where: { tenantId: request.tenantId, projectId, sourceUrl: link.sourceUrl, targetUrl: link.targetUrl } })
          if (existing) await tx.backlink.update({ where: { id: existing.id }, data: { anchor: link.anchor, dofollow: link.dofollow, lastChecked: new Date(), isActive: true } })
          else await tx.backlink.create({ data: { tenantId: request.tenantId, projectId, ...link, isActive: true } })
        }
      })
      return { message: imported.backlinks.length + " backlinks importés (échantillon de 100 maximum).", imported: imported.backlinks.length, totalAvailable: imported.totalAvailable, provider: "DataForSEO" }
    }
  )

  // POST /api/backlinks — Ajouter un backlink manuellement
  fastify.post(
    "/api/backlinks",
    { preHandler: [requireRole("MEMBER"), requireFeature("backlinks")] },
    async (request, reply) => {
      const schema = z.object({
        sourceUrl: z.string().max(2048).url().refine((value) => /^https?:\/\//i.test(value)),
        targetUrl: z.string().min(1).max(2048).refine((value) => /^https?:\/\//i.test(value) || (value.startsWith("/") && !value.startsWith("//"))),
        anchor: z.string().optional(),
        dofollow: z.boolean().default(true),
        domainRating: z.number().min(0).max(100).optional(),
        projectId: z.string().optional(),
      })
      const parse = schema.safeParse(request.body)
      if (!parse.success) return reply.status(400).send({ error: "Données invalides" })
      const { sourceUrl, targetUrl, anchor, dofollow, domainRating, projectId } = parse.data

      if (projectId) {
        const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
        if (!project) return reply.status(403).send({ error: "Accès refusé" })
      }

      let sourceDomain = ""
      try { sourceDomain = new URL(sourceUrl).hostname } catch { sourceDomain = sourceUrl }

      const bl = await prisma.backlink.create({
        data: {
          tenantId: request.tenantId,
          projectId: projectId ?? null,
          sourceUrl,
          sourceDomain,
          targetUrl,
          anchor: anchor ?? null,
          dofollow,
          domainRating: domainRating ?? null,
          isActive: true,
        },
      })
      return reply.status(201).send(bl)
    }
  )

  // DELETE /api/backlinks/:id — Supprimer un backlink
  fastify.delete<{ Params: { id: string } }>(
    "/api/backlinks/:id",
    { preHandler: [requireRole("MEMBER"), requireFeature("backlinks")] },
    async (request, reply) => {
      const bl = await prisma.backlink.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId, project: { userId: request.userId } },
      })
      if (!bl) return reply.status(404).send({ error: "Backlink introuvable" })
      await prisma.backlink.update({
        where: { id: bl.id },
        data: { isActive: false, lastChecked: new Date() },
      })
      return reply.status(204).send()
    }
  )
}

export default backlinksRoutes
