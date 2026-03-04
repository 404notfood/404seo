import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { crawlQueue } from "../lib/redis"
import { isValidPublicUrl } from "@seo/crawler"
import { generatePDF, type ReportData } from "@seo/reporter"
import { calculateGlobalScore, generateRecommendations } from "@seo/scorer"
import { requireRole } from "../lib/guards"

const LaunchAuditSchema = z.object({
  url: z.string().url(),
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
    preHandler: [requireRole("MEMBER")],
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const parse = LaunchAuditSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: "Données invalides", details: parse.error.flatten() })
    }

    const { url, projectId, options } = parse.data

    if (!isValidPublicUrl(url)) {
      return reply.status(400).send({ error: "URL invalide ou non autorisée" })
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: request.tenantId },
    })
    if (!project) {
      return reply.status(404).send({ error: "Projet introuvable" })
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

  // GET /api/audits — Liste
  fastify.get("/api/audits", async (request, reply) => {
    const audits = await prisma.audit.findMany({
      where: { tenantId: request.tenantId, deletedAt: null },
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
    type ReportStat = { scoreGlobal: number; criticalIssues: number | null; warnings: number | null; passed: number | null }
    const [total, completed, reports, recent] = await Promise.all([
      prisma.audit.count({ where: { tenantId: request.tenantId, deletedAt: null } }),
      prisma.audit.count({ where: { tenantId: request.tenantId, deletedAt: null, status: "COMPLETED" } }),
      prisma.auditReport.findMany({
        where: { audit: { tenantId: request.tenantId, deletedAt: null } },
        select: { scoreGlobal: true, criticalIssues: true, warnings: true, passed: true },
      }) as Promise<ReportStat[]>,
      prisma.audit.findMany({
        where: { tenantId: request.tenantId, deletedAt: null },
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

  // GET /api/audits/:id — Détail
  fastify.get<{ Params: { id: string } }>("/api/audits/:id", async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, deletedAt: null },
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
      where: { id: request.params.id, tenantId: request.tenantId, deletedAt: null },
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

    // Vérifier appartenance
    const audit = await prisma.audit.findFirst({
      where: { id, tenantId, deletedAt: null },
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
      where: { id: request.params.id, tenantId: request.tenantId, status: "COMPLETED", deletedAt: null },
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
      where: { id: request.params.id, tenantId: request.tenantId, status: "COMPLETED", deletedAt: null },
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

  // DELETE /api/audits/:id — MEMBER+ (soft delete)
  fastify.delete<{ Params: { id: string } }>("/api/audits/:id", { preHandler: [requireRole("MEMBER")] }, async (request, reply) => {
    const audit = await prisma.audit.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, deletedAt: null },
    })
    if (!audit) return reply.status(404).send({ error: "Audit introuvable" })
    await prisma.audit.update({ where: { id: audit.id }, data: { deletedAt: new Date() } })
    return reply.status(204).send()
  })
}

export default auditsRoutes
