import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { crawlQueue } from "../lib/redis"
import { isValidPublicUrl } from "@seo/crawler"
import { generatePDF, type ReportData } from "@seo/reporter"
import { calculateGlobalScore, generateRecommendations } from "@seo/scorer"
import { requireRole, assertProjectOwner } from "../lib/guards"
import { requireAuditQuota } from "../lib/quotas"

const LaunchAuditSchema = z.object({
  projectId: z.string().cuid(),
  options: z
    .object({
      maxPages: z.number().int().min(1).max(500).default(100),
      maxDepth: z.number().int().min(1).max(10).default(5),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    })
    .optional(),
})

const auditsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/audits — Lancer un audit (MEMBER+ requis)
  fastify.post("/api/audits", {
    preHandler: [requireRole("MEMBER"), requireAuditQuota()],
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const parse = LaunchAuditSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: "Données invalides", details: parse.error.flatten() })
    }

    const { projectId, options } = parse.data

    // Vérifie que le projet appartient à cet utilisateur
    const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
    if (!project) {
      return reply.status(404).send({ error: "Projet introuvable" })
    }

    const url = project.domain

    if (!isValidPublicUrl(url)) {
      return reply.status(400).send({ error: "URL du projet invalide ou non autorisée" })
    }

    // Vérification du quota pages
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: request.tenantId },
    })
    const maxPages = options?.maxPages ?? 100
    const pagesUsed = subscription?.pagesUsed ?? 0
    const pagesQuota = subscription?.pagesQuota ?? 100
    if (pagesUsed + maxPages > pagesQuota) {
      const remaining = Math.max(0, pagesQuota - pagesUsed)
      return reply.status(403).send({
        error: `Quota pages dépassé. ${remaining} page(s) restante(s) sur ${pagesQuota}.`,
      })
    }

    const audit = await prisma.audit.create({
      data: {
        tenantId: request.tenantId,
        userId: request.userId,
        projectId,
        url,
        status: "PENDING",
        options: options ?? {},
      },
    })

    await prisma.auditJob.create({
      data: { auditId: audit.id, type: "CRAWL", status: "QUEUED" },
    })

    const job = await crawlQueue.add("crawl" as never, {
      auditId: audit.id,
      url,
      options: options ?? {},
    })

    await prisma.auditJob.updateMany({
      where: { auditId: audit.id, type: "CRAWL" },
      data: { bullJobId: job.id ?? null },
    })

    return reply.status(201).send({ auditId: audit.id, jobId: job.id })
  })

  // GET /api/audits — Liste (filtrée par userId)
  fastify.get("/api/audits", async (request, reply) => {
    const { projectId } = request.query as { projectId?: string }

    // Valider que le projectId appartient à l'utilisateur
    if (projectId) {
      const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    const audits = await prisma.audit.findMany({
      where: { tenantId: request.tenantId, userId: request.userId, deletedAt: null, ...(projectId ? { projectId } : {}) },
      include: {
        project: { select: { name: true, domain: true } },
        report: { select: { scoreGlobal: true, criticalIssues: true } },
        jobs: { select: { type: true, status: true, progress: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return reply.send(audits)
  })

  // GET /api/audits/stats — Stats pour le dashboard
  fastify.get("/api/audits/stats", async (request, reply) => {
    const { projectId } = request.query as { projectId?: string }

    if (projectId) {
      const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    const auditWhere = { tenantId: request.tenantId, userId: request.userId, deletedAt: null as null, ...(projectId ? { projectId } : {}) }
    type ReportStat = { scoreGlobal: number; criticalIssues: number | null; warnings: number | null; passed: number | null }
    const [total, completed, reports, recent] = await Promise.all([
      prisma.audit.count({ where: auditWhere }),
      prisma.audit.count({ where: { ...auditWhere, status: "COMPLETED" } }),
      prisma.auditReport.findMany({
        where: { audit: auditWhere },
        select: { scoreGlobal: true, criticalIssues: true, warnings: true, passed: true },
      }) as Promise<ReportStat[]>,
      prisma.audit.findMany({
        where: auditWhere,
        include: {
          project: { select: { name: true } },
          report: { select: { scoreGlobal: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ])

    const avgScore = reports.length
      ? Math.round(reports.reduce((s: number, r) => s + r.scoreGlobal, 0) / reports.length)
      : null

    const totalCritical = reports.reduce((s: number, r) => s + (r.criticalIssues ?? 0), 0)
    const totalPassed = reports.reduce((s: number, r) => s + (r.passed ?? 0), 0)

    return reply.send({ total, completed, avgScore, totalCritical, totalPassed, recent })
  })

  // GET /api/audits/:id — Détail (uniquement l'audit du user)
  fastify.get<{ Params: { id: string } }>("/api/audits/:id", async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId, deletedAt: null },
      include: {
        project: true,
        report: true,
        jobs: true,
        pages: {
          select: {
            id: true,
            url: true,
            statusCode: true,
            redirectUrl: true,
            isIndexable: true,
            hasRobotsTxt: true,
            hasSitemap: true,
            wordCount: true,
            lang: true,
            results: true,
          },
          take: 100,
        },
      },
    })
    if (!audit) return reply.status(404).send({ error: "Audit introuvable" })
    return reply.send(audit)
  })

  // GET /api/audits/:id/breakdown — Répartition pages + top issues
  fastify.get<{ Params: { id: string } }>("/api/audits/:id/breakdown", async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId, deletedAt: null },
    })
    if (!audit) return reply.status(404).send({ error: "Audit introuvable" })

    const pages = await prisma.auditPage.findMany({
      where: { auditId: audit.id },
      select: { statusCode: true, isIndexable: true, redirectUrl: true },
    })

    const healthy = pages.filter((p) => p.statusCode === 200 && p.isIndexable !== false && !p.redirectUrl).length
    const redirects = pages.filter((p) => p.redirectUrl || (p.statusCode && [301, 302, 307, 308].includes(p.statusCode))).length
    const errors = pages.filter((p) => p.statusCode && (p.statusCode >= 400 || p.statusCode === 0)).length
    const blocked = pages.filter((p) => p.isIndexable === false).length

    // Top issues via groupBy (optimisé vs findMany + agrégation JS)
    const grouped = await prisma.pageResult.groupBy({
      by: ["checkName", "category", "status", "priority"],
      where: { page: { auditId: audit.id }, status: { not: "PASS" } },
      _count: { _all: true },
    })

    const severityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 }
    const issueMap = new Map<string, { checkName: string; category: string; failCount: number; warnCount: number; maxPriority: string }>()

    for (const g of grouped) {
      const existing = issueMap.get(g.checkName)
      const count = g._count._all
      if (existing) {
        if (g.status === "FAIL") existing.failCount += count
        if (g.status === "WARN") existing.warnCount += count
        if (severityWeight[g.priority as keyof typeof severityWeight] > severityWeight[existing.maxPriority as keyof typeof severityWeight]) {
          existing.maxPriority = g.priority
        }
      } else {
        issueMap.set(g.checkName, {
          checkName: g.checkName,
          category: g.category,
          failCount: g.status === "FAIL" ? count : 0,
          warnCount: g.status === "WARN" ? count : 0,
          maxPriority: g.priority,
        })
      }
    }

    const topIssues = [...issueMap.values()]
      .map((i) => ({
        ...i,
        score: (i.failCount * 3 + i.warnCount) * severityWeight[i.maxPriority as keyof typeof severityWeight],
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return reply.send({
      breakdown: { healthy, redirects, errors, blocked },
      topIssues,
      totalPages: pages.length,
    })
  })

  // GET /api/audits/:id/progress — SSE progression temps réel
  const SSE_MAX_DURATION_MS = 5 * 60 * 1000 // 5 minutes max
  const sseConnections = new Map<string, number>() // tenantId → count
  const SSE_MAX_PER_TENANT = 10

  fastify.get<{ Params: { id: string } }>("/api/audits/:id/progress", async (request, reply) => {
    const { id } = request.params
    const tenantId = request.tenantId

    // Limite de connexions SSE par tenant
    const currentCount = sseConnections.get(tenantId) ?? 0
    if (currentCount >= SSE_MAX_PER_TENANT) {
      return reply.status(429).send({ error: "Trop de connexions SSE simultanées" })
    }
    sseConnections.set(tenantId, currentCount + 1)

    // Vérifier appartenance (userId + tenantId)
    const audit = await prisma.audit.findFirst({
      where: { id, tenantId, userId: request.userId, deletedAt: null },
    })
    if (!audit) {
      sseConnections.set(tenantId, (sseConnections.get(tenantId) ?? 1) - 1)
      return reply.status(404).send({ error: "Audit introuvable" })
    }

    // Headers SSE
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    })

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const cleanup = () => {
      clearInterval(interval)
      clearTimeout(timeout)
      sseConnections.set(tenantId, Math.max(0, (sseConnections.get(tenantId) ?? 1) - 1))
    }

    // Timeout max pour éviter les connexions infinies
    const timeout = setTimeout(() => {
      cleanup()
      reply.raw.write("event: timeout\ndata: {}\n\n")
      reply.raw.end()
    }, SSE_MAX_DURATION_MS)

    // Poll toutes les 1.5s
    const interval = setInterval(async () => {
      try {
        const current = await prisma.audit.findUnique({
          where: { id },
          select: {
            status: true,
            jobs: { select: { type: true, status: true, progress: true } },
            report: { select: { scoreGlobal: true } },
          },
        })

        if (!current) {
          cleanup()
          reply.raw.end()
          return
        }

        send({
          status: current.status,
          jobs: current.jobs,
          scoreGlobal: current.report?.scoreGlobal ?? null,
        })

        if (["COMPLETED", "FAILED", "CANCELLED"].includes(current.status)) {
          cleanup()
          reply.raw.write("event: done\ndata: {}\n\n")
          reply.raw.end()
        }
      } catch {
        cleanup()
        reply.raw.end()
      }
    }, 1500)

    // Nettoyer si le client se déconnecte
    request.raw.on("close", () => {
      cleanup()
    })

    return reply
  })

  // GET /api/audits/:id/pdf — Télécharger le rapport PDF
  fastify.get<{ Params: { id: string }; Querystring: { keywords?: string } }>("/api/audits/:id/pdf", async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId, status: "COMPLETED", deletedAt: null },
      include: {
        report: true,
        pages: { include: { results: true } },
        tenant: { select: { name: true, brandColor: true, logoUrl: true } },
      },
    })

    if (!audit) return reply.status(404).send({ error: "Rapport introuvable ou audit non terminé" })
    if (!audit.report) return reply.status(404).send({ error: "Rapport non généré" })

    // Reconstruire l'analyse depuis les résultats DB
    type PageRes = {
      category: string; checkName: string; status: string; score: number
      value: string | null; expected: string | null; message: string
      priority: string; effort: string
    }
    const allResults: PageRes[] = audit.pages.flatMap((p: (typeof audit.pages)[0]) => p.results as PageRes[])

    const toCheck = (r: typeof allResults[0]) => ({
      category: r.category as "TECHNICAL" | "ON_PAGE" | "PERFORMANCE" | "UX_MOBILE",
      checkName: r.checkName,
      status: r.status as "PASS" | "WARN" | "FAIL",
      score: r.score,
      value: r.value ?? undefined,
      expected: r.expected ?? undefined,
      message: r.message,
      priority: r.priority as "HIGH" | "MEDIUM" | "LOW",
      effort: r.effort as "HIGH" | "MEDIUM" | "LOW",
    })

    const analysis = {
      technical: allResults.filter((r) => r.category === "TECHNICAL").map(toCheck),
      onPage: allResults.filter((r) => r.category === "ON_PAGE").map(toCheck),
      performance: allResults.filter((r) => r.category === "PERFORMANCE").map(toCheck),
      uxMobile: allResults.filter((r) => r.category === "UX_MOBILE").map(toCheck),
    }

    const score = calculateGlobalScore(analysis)
    const recommendations = generateRecommendations(score)

    // Keywords optionnels dans le PDF
    const includeKeywords = (request.query as { keywords?: string }).keywords === "true"
    const keywordsData = includeKeywords && audit.report
      ? ((audit.report.aiSuggestions as { keywords?: { keywords?: unknown[] } } | null)?.keywords ?? undefined)
      : undefined

    const pdfBuffer = await generatePDF({
      url: audit.url,
      date: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
      score,
      recommendations,
      keywords: keywordsData as ReportData["keywords"],
      tenantBranding: {
        name: audit.tenant.name,
        brandColor: audit.tenant.brandColor ?? "#2563eb",
        logoUrl: audit.tenant.logoUrl ?? undefined,
      },
    })

    const filename = `audit-seo-${new URL(audit.url).hostname}-${new Date().toISOString().split("T")[0]}.pdf`

    reply.header("Content-Type", "application/pdf")
    reply.header("Content-Disposition", `attachment; filename="${filename}"`)
    reply.header("Content-Length", pdfBuffer.length)

    return reply.send(pdfBuffer)
  })

  // GET /api/audits/:id/keywords — Mots-clés agrégés + par page
  fastify.get<{ Params: { id: string } }>("/api/audits/:id/keywords", async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId, status: "COMPLETED", deletedAt: null },
      include: {
        report: { select: { aiSuggestions: true } },
        pages: {
          select: { id: true, url: true, topKeywords: true },
          take: 100,
        },
      },
    })
    if (!audit) return reply.status(404).send({ error: "Audit introuvable ou non terminé" })

    const siteKeywords = (audit.report?.aiSuggestions as { keywords?: unknown } | null)?.keywords ?? null
    const pageKeywords = audit.pages.map((p) => ({
      id: p.id,
      url: p.url,
      topKeywords: p.topKeywords ?? [],
    }))

    return reply.send({ siteKeywords, pageKeywords })
  })

  // GET /api/audits/compare?ids=id1,id2 — Comparer 2 audits
  fastify.get("/api/audits/compare", async (request, reply) => {
    const { ids } = request.query as { ids?: string }
    if (!ids) return reply.status(400).send({ error: "Paramètre ids requis (id1,id2)" })

    const auditIds = ids.split(",").map((s) => s.trim()).filter(Boolean)
    if (auditIds.length !== 2) return reply.status(400).send({ error: "Exactement 2 IDs requis" })

    const audits = await prisma.audit.findMany({
      where: {
        id: { in: auditIds },
        tenantId: request.tenantId,
        userId: request.userId,
        status: "COMPLETED",
        deletedAt: null,
      },
      include: {
        report: true,
        project: { select: { name: true, domain: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    if (audits.length !== 2) return reply.status(404).send({ error: "Les 2 audits doivent exister et être complétés" })

    const [before, after] = audits

    // Issues par audit pour calculer les nouvelles/résolues
    const [issuesBefore, issuesAfter] = await Promise.all([
      prisma.pageResult.groupBy({
        by: ["checkName", "status"],
        where: { page: { auditId: before.id }, status: { not: "PASS" } },
        _count: { _all: true },
      }),
      prisma.pageResult.groupBy({
        by: ["checkName", "status"],
        where: { page: { auditId: after.id }, status: { not: "PASS" } },
        _count: { _all: true },
      }),
    ])

    const beforeChecks = new Set(issuesBefore.map((i) => i.checkName))
    const afterChecks = new Set(issuesAfter.map((i) => i.checkName))

    const resolved = [...beforeChecks].filter((c) => !afterChecks.has(c))
    const newIssues = [...afterChecks].filter((c) => !beforeChecks.has(c))

    return reply.send({
      before: {
        id: before.id,
        url: before.url,
        createdAt: before.createdAt,
        project: before.project,
        report: before.report,
      },
      after: {
        id: after.id,
        url: after.url,
        createdAt: after.createdAt,
        project: after.project,
        report: after.report,
      },
      delta: {
        global: (after.report?.scoreGlobal ?? 0) - (before.report?.scoreGlobal ?? 0),
        technical: (after.report?.scoreTechnical ?? 0) - (before.report?.scoreTechnical ?? 0),
        onPage: (after.report?.scoreOnPage ?? 0) - (before.report?.scoreOnPage ?? 0),
        performance: (after.report?.scorePerformance ?? 0) - (before.report?.scorePerformance ?? 0),
        ux: (after.report?.scoreUX ?? 0) - (before.report?.scoreUX ?? 0),
      },
      resolved,
      newIssues,
    })
  })

  // POST /api/audits/:id/share — Générer un lien de partage public
  fastify.post<{ Params: { id: string } }>("/api/audits/:id/share", { preHandler: [requireRole("MEMBER")] }, async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId, status: "COMPLETED", deletedAt: null },
    })
    if (!audit) return reply.status(404).send({ error: "Audit introuvable ou non terminé" })

    // Générer un token unique
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 jours

    await prisma.sharedReport.create({
      data: {
        token,
        auditId: audit.id,
        tenantId: request.tenantId,
        expiresAt,
      },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://seo.404notfood.fr"
    return reply.send({
      shareUrl: `${appUrl}/report/${token}`,
      token,
      expiresAt,
    })
  })

  // GET /api/reports/:token — Rapport public (pas d'auth requise, géré dans le plugin auth)
  fastify.get<{ Params: { token: string } }>("/api/reports/:token", async (request, reply) => {
    const shared = await prisma.sharedReport.findUnique({
      where: { token: request.params.token },
      include: {
        audit: {
          include: {
            report: true,
            project: { select: { name: true, domain: true } },
            tenant: { select: { name: true, brandColor: true, logoUrl: true } },
          },
        },
      },
    })

    if (!shared || shared.expiresAt < new Date()) {
      return reply.status(404).send({ error: "Lien de partage expiré ou introuvable" })
    }

    // Incrémenter le compteur de vues
    await prisma.sharedReport.update({
      where: { id: shared.id },
      data: { viewCount: { increment: 1 } },
    })

    return reply.send({
      url: shared.audit.url,
      createdAt: shared.audit.createdAt,
      project: shared.audit.project,
      tenant: shared.audit.tenant,
      report: shared.audit.report,
      expiresAt: shared.expiresAt,
    })
  })

  // DELETE /api/audits/:id — MEMBER+ (soft delete)
  fastify.delete<{ Params: { id: string } }>("/api/audits/:id", { preHandler: [requireRole("MEMBER")] }, async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId, deletedAt: null },
    })
    if (!audit) return reply.status(404).send({ error: "Audit introuvable" })
    await prisma.audit.update({ where: { id: audit.id }, data: { deletedAt: new Date() } })
    return reply.status(204).send()
  })
}

export default auditsRoutes
