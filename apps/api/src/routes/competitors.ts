// routes/competitors.ts — Analyse concurrentielle basée sur les audits en DB
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { requireRole, assertProjectOwner } from "../lib/guards.js"

const AddCompetitorSchema = z.object({
  domain: z.string().min(3),
  label: z.string().optional(),
  projectId: z.string().optional(),
})

// ── Extraire les domaines concurrents depuis les audits (liens externes) ───────
async function extractCompetitorDomainsFromAudits(tenantId: string, projectId?: string) {
  // Récupérer les rapports d'audits pour avoir le score global du site du tenant
  const ownReports = await prisma.auditReport.findMany({
    where: {
      audit: {
        tenantId,
        status: "COMPLETED",
        ...(projectId ? { projectId } : {}),
      },
    },
    select: {
      scoreGlobal: true,
      scoreTechnical: true,
      scoreOnPage: true,
      scorePerformance: true,
      scoreUX: true,
      totalIssues: true,
      criticalIssues: true,
      totalPages: true,
      audit: { select: { url: true, project: { select: { domain: true } } } },
    },
    orderBy: { generatedAt: "desc" },
    take: 5,
  })

  return ownReports
}

const competitorsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/competitors — Liste des concurrents + comparaison avec le tenant
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/api/competitors",
    async (request, reply) => {
      const { projectId } = request.query

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

      // Concurrents configurés par l'utilisateur (ses projets seulement)
      const competitors = await prisma.competitor.findMany({
        where: {
          tenantId: request.tenantId,
          ...projectFilter,
        },
        orderBy: { createdAt: "desc" },
      })

      // Scores du tenant (ses propres audits)
      const ownReports = await extractCompetitorDomainsFromAudits(request.tenantId, projectId)
      const ownLatest = ownReports[0]
      const ownScore = ownLatest
        ? {
            scoreGlobal: Math.round(ownLatest.scoreGlobal),
            scoreTechnical: Math.round(ownLatest.scoreTechnical),
            scoreOnPage: Math.round(ownLatest.scoreOnPage),
            scorePerformance: Math.round(ownLatest.scorePerformance),
            scoreUX: Math.round(ownLatest.scoreUX),
            totalIssues: ownLatest.totalIssues,
            criticalIssues: ownLatest.criticalIssues,
            totalPages: ownLatest.totalPages,
            domain: ownLatest.audit.project?.domain ?? ownLatest.audit.url,
          }
        : null

      // Audits des domaines concurrents (s'ils ont été audités sur la plateforme)
      const competitorData = await Promise.all(
        competitors.map(async (comp) => {
          // Chercher un audit de ce domaine dans la DB du tenant
          const latestAudit = await prisma.audit.findFirst({
            where: {
              tenantId: request.tenantId,
              url: { contains: comp.domain },
              status: "COMPLETED",
            },
            include: {
              report: {
                select: {
                  scoreGlobal: true,
                  scoreTechnical: true,
                  scoreOnPage: true,
                  scorePerformance: true,
                  scoreUX: true,
                  totalIssues: true,
                  criticalIssues: true,
                  totalPages: true,
                },
              },
            },
            orderBy: { completedAt: "desc" },
          })

          return {
            id: comp.id,
            domain: comp.domain,
            label: comp.label,
            createdAt: comp.createdAt,
            isYou: false,
            hasAudit: !!latestAudit?.report,
            scoreGlobal: latestAudit?.report ? Math.round(latestAudit.report.scoreGlobal) : null,
            scoreTechnical: latestAudit?.report ? Math.round(latestAudit.report.scoreTechnical) : null,
            scoreOnPage: latestAudit?.report ? Math.round(latestAudit.report.scoreOnPage) : null,
            scorePerformance: latestAudit?.report ? Math.round(latestAudit.report.scorePerformance) : null,
            scoreUX: latestAudit?.report ? Math.round(latestAudit.report.scoreUX) : null,
            totalIssues: latestAudit?.report?.totalIssues ?? null,
            criticalIssues: latestAudit?.report?.criticalIssues ?? null,
            totalPages: latestAudit?.report?.totalPages ?? null,
            auditId: latestAudit?.id ?? null,
          }
        })
      )

      // Domaines suggérés via les liens externes des audits
      const suggestedDomains = await getSuggestedCompetitors(request.tenantId, projectId, competitors.map((c) => c.domain))

      return reply.send({
        own: ownScore,
        competitors: competitorData,
        suggested: suggestedDomains,
      })
    }
  )

  // POST /api/competitors — Ajouter un concurrent
  fastify.post(
    "/api/competitors",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const parse = AddCompetitorSchema.safeParse(request.body)
      if (!parse.success) return reply.status(400).send({ error: "Données invalides" })
      const { domain, label, projectId } = parse.data

      if (projectId) {
        const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
        if (!project) return reply.status(403).send({ error: "Accès refusé" })
      }

      // Normaliser le domaine
      let normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")

      const competitor = await prisma.competitor.upsert({
        where: {
          tenantId_domain: { tenantId: request.tenantId, domain: normalizedDomain },
        },
        create: {
          tenantId: request.tenantId,
          domain: normalizedDomain,
          label: label ?? null,
          projectId: projectId ?? null,
        },
        update: { label: label ?? undefined },
      })

      return reply.status(201).send(competitor)
    }
  )

  // DELETE /api/competitors/:id
  fastify.delete<{ Params: { id: string } }>(
    "/api/competitors/:id",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const comp = await prisma.competitor.findFirst({
        where: {
          id: request.params.id,
          tenantId: request.tenantId,
          project: { userId: request.userId },
        },
      })
      if (!comp) return reply.status(404).send({ error: "Concurrent introuvable" })
      await prisma.competitor.delete({ where: { id: comp.id } })
      return reply.status(204).send()
    }
  )
}

// ── Suggestions de concurrents depuis les liens externes ──────────────────────
async function getSuggestedCompetitors(
  tenantId: string,
  projectId: string | undefined,
  existingDomains: string[]
): Promise<Array<{ domain: string; mentionCount: number }>> {
  try {
    // Récupérer les URLs auditées pour extraire le domaine du tenant
    const audits = await prisma.audit.findMany({
      where: { tenantId, status: "COMPLETED", ...(projectId ? { projectId } : {}) },
      select: { url: true },
      take: 5,
    })

    const tenantDomains = audits.map((a) => {
      try { return new URL(a.url).hostname } catch { return "" }
    }).filter(Boolean)

    // Extraire les domaines externes des pages auditées
    // (On n'a pas les URLs exactes des liens, on utilise les audits de pages)
    // Ici on retourne juste les backlinks existants comme suggestion
    const backlinks = await prisma.backlink.findMany({
      where: { tenantId, isActive: true },
      select: { sourceDomain: true },
    })

    const domainCount: Record<string, number> = {}
    for (const bl of backlinks) {
      if (!tenantDomains.includes(bl.sourceDomain) && !existingDomains.includes(bl.sourceDomain)) {
        domainCount[bl.sourceDomain] = (domainCount[bl.sourceDomain] ?? 0) + 1
      }
    }

    return Object.entries(domainCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, mentionCount: count }))
  } catch {
    return []
  }
}

export default competitorsRoutes
