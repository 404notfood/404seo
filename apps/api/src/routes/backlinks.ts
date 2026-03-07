// routes/backlinks.ts — Analyse de backlinks via OpenLinkProfiler (gratuit) + liens internes
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { requireRole, assertProjectOwner } from "../lib/guards.js"

const FetchBacklinksSchema = z.object({
  domain: z.string().min(3),
  projectId: z.string().optional(),
})

// ── OpenLinkProfiler API (gratuit, sans clé) ──────────────────────────────────
// Docs : https://openlinkprofiler.org/api
async function fetchFromOpenLinkProfiler(
  domain: string
): Promise<Array<{ sourceUrl: string; sourceDomain: string; targetUrl: string; anchor: string; dofollow: boolean }>> {
  try {
    // API gratuite d'OpenLinkProfiler
    const url = `https://openlinkprofiler.org/api/?url=${encodeURIComponent(domain)}&limit=100&type=json`
    const res = await fetch(url, {
      headers: { "User-Agent": "SEO-Platform/1.0" },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as unknown

    // Parser le format OLP
    if (!Array.isArray(data)) return []
    return (data as Record<string, string>[]).map((item) => {
      const sourceUrl = String(item.source_url ?? item.sourceUrl ?? "")
      let sourceDomain = ""
      try { sourceDomain = new URL(sourceUrl).hostname } catch { sourceDomain = sourceUrl }
      return {
        sourceUrl,
        sourceDomain,
        targetUrl: String(item.target_url ?? item.targetUrl ?? "/"),
        anchor: String(item.anchor_text ?? item.anchor ?? ""),
        dofollow: String(item.link_type ?? item.type ?? "dofollow") !== "nofollow",
      }
    }).filter((b) => b.sourceUrl)
  } catch {
    return []
  }
}

// ── Fallback : extraire les liens externes des audits en DB ───────────────────
async function extractFromAudits(tenantId: string, domain: string, projectId?: string) {
  // Récupérer les pages auditées qui ont des liens externes
  const pages = await prisma.auditPage.findMany({
    where: {
      audit: {
        tenantId,
        status: "COMPLETED",
        ...(projectId ? { projectId } : {}),
      },
      externalLinks: { gt: 0 },
    },
    select: { url: true, externalLinks: true },
    take: 200,
  })

  // On ne peut pas extraire les URLs exactes des liens entrants depuis les audits
  // (on n'a que le comptage), donc on retourne vide pour le fallback
  return []
}

const backlinksRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/backlinks — Liste des backlinks
  fastify.get<{ Querystring: { projectId?: string; domain?: string; page?: string } }>(
    "/api/backlinks",
    async (request, reply) => {
      const { projectId, domain, page: pageStr } = request.query
      const page = Math.max(1, parseInt(pageStr ?? "1"))
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
          where: { tenantId: request.tenantId, userId: request.userId },
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
            isActive: true,
          },
        }),
      ])

      // Stats agrégées
      const all = await prisma.backlink.findMany({
        where: { tenantId: request.tenantId, isActive: true },
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

  // POST /api/backlinks/fetch — Importer les backlinks depuis OpenLinkProfiler
  fastify.post(
    "/api/backlinks/fetch",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const parse = FetchBacklinksSchema.safeParse(request.body)
      if (!parse.success) return reply.status(400).send({ error: "Données invalides" })
      const { domain, projectId } = parse.data

      if (projectId) {
        const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
        if (!project) return reply.status(403).send({ error: "Accès refusé" })
      }

      reply.status(202).send({ message: "Import lancé", domain })

      setImmediate(async () => {
        try {
          const backlinks = await fetchFromOpenLinkProfiler(domain)
          fastify.log.info(`OpenLinkProfiler : ${backlinks.length} backlinks pour ${domain}`)

          // Upsert en DB
          for (const bl of backlinks) {
            await prisma.backlink.upsert({
              where: {
                id: (
                  await prisma.backlink.findFirst({
                    where: { tenantId: request.tenantId, sourceUrl: bl.sourceUrl, targetUrl: bl.targetUrl },
                    select: { id: true },
                  })
                )?.id ?? "___not_found___",
              },
              create: {
                tenantId: request.tenantId,
                projectId: projectId ?? null,
                sourceUrl: bl.sourceUrl,
                sourceDomain: bl.sourceDomain,
                targetUrl: bl.targetUrl,
                anchor: bl.anchor,
                dofollow: bl.dofollow,
                isActive: true,
              },
              update: {
                anchor: bl.anchor,
                dofollow: bl.dofollow,
                lastChecked: new Date(),
                isActive: true,
              },
            })
          }
        } catch (err) {
          fastify.log.error({ err }, "Erreur import backlinks")
        }
      })
    }
  )

  // POST /api/backlinks — Ajouter un backlink manuellement
  fastify.post(
    "/api/backlinks",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const schema = z.object({
        sourceUrl: z.string().url(),
        targetUrl: z.string().min(1),
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
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const bl = await prisma.backlink.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
      })
      if (!bl) return reply.status(404).send({ error: "Backlink introuvable" })
      await prisma.backlink.delete({ where: { id: bl.id } })
      return reply.status(204).send()
    }
  )
}

export default backlinksRoutes
