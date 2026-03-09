import type { FastifyPluginAsync } from "fastify"
import { prisma } from "../lib/prisma"
import { assertProjectOwner } from "../lib/guards"

// ─── Types query params ────────────────────────────────

interface IssuesQuery {
  category?: "TECHNICAL" | "ON_PAGE" | "PERFORMANCE" | "UX_MOBILE"
  status?: "FAIL" | "WARN"
  priority?: "HIGH" | "MEDIUM" | "LOW"
  page?: string
  limit?: string
  projectId?: string
}

interface ContentQuery {
  thin?: string
  noMeta?: string
  noH1?: string
  page?: string
  limit?: string
  projectId?: string
}

interface ProjectQuery {
  projectId?: string
}

// ─── Helpers ───────────────────────────────────────────

// Filtre sur les pages d'audits complétés — restreint au userId du demandeur
const completedAuditFilter = (tenantId: string, userId: string, projectId?: string) => ({
  audit: { tenantId, userId, deletedAt: null, status: "COMPLETED" as const, ...(projectId ? { projectId } : {}) },
})

const severityWeight: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }

// ─── Plugin ────────────────────────────────────────────

const aggregationRoutes: FastifyPluginAsync = async (fastify) => {
  // ─────────────────────────────────────────────────────
  // GET /api/issues — Problèmes cross-audits paginés
  // ─────────────────────────────────────────────────────
  fastify.get("/api/issues", async (request, reply) => {
    const query = request.query as IssuesQuery
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "50", 10) || 50))
    const skip = (page - 1) * limit
    const { projectId } = query

    if (projectId) {
      const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    const filter = completedAuditFilter(request.tenantId, request.userId, projectId)

    const where = {
      page: filter,
      status: query.status ? (query.status as "FAIL" | "WARN") : { in: ["FAIL" as const, "WARN" as const] },
      ...(query.category ? { category: query.category } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    }

    const [items, total, criticalCount, warningCount] = await Promise.all([
      prisma.pageResult.findMany({
        where,
        include: {
          page: {
            select: {
              url: true,
              audit: {
                select: { id: true, url: true, project: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: [{ priority: "asc" }, { status: "asc" }],
        skip,
        take: limit,
      }),
      prisma.pageResult.count({ where }),
      prisma.pageResult.count({
        where: {
          page: filter,
          status: "FAIL",
          ...(query.category ? { category: query.category } : {}),
        },
      }),
      prisma.pageResult.count({
        where: {
          page: filter,
          status: "WARN",
          ...(query.category ? { category: query.category } : {}),
        },
      }),
    ])

    return reply.send({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      counts: {
        critical: criticalCount,
        warnings: warningCount,
        total: criticalCount + warningCount,
      },
    })
  })

  // ─────────────────────────────────────────────────────
  // GET /api/performance-overview — Métriques performance
  // ─────────────────────────────────────────────────────
  fastify.get("/api/performance-overview", async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.userId
    const { projectId } = request.query as ProjectQuery

    if (projectId) {
      const project = await assertProjectOwner(projectId, userId, tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    const [reports, pages] = await Promise.all([
      prisma.auditReport.findMany({
        where: { audit: { tenantId, userId, deletedAt: null, status: "COMPLETED", ...(projectId ? { projectId } : {}) } },
        select: {
          scorePerformance: true,
          auditId: true,
          audit: { select: { url: true, createdAt: true } },
        },
        orderBy: { audit: { createdAt: "desc" } },
      }),
      prisma.auditPage.findMany({
        where: completedAuditFilter(tenantId, userId, projectId),
        select: {
          url: true,
          responseTime: true,
          pageSize: true,
          totalImages: true,
          imagesWithAlt: true,
          imagesWithoutAlt: true,
          audit: { select: { url: true } },
        },
      }),
    ])

    const avgScore = reports.length
      ? Math.round(reports.reduce((s, r) => s + r.scorePerformance, 0) / reports.length)
      : 0

    const pagesWithTime = pages.filter((p) => p.responseTime !== null)
    const avgResponseTime = pagesWithTime.length
      ? Math.round(pagesWithTime.reduce((s, p) => s + (p.responseTime ?? 0), 0) / pagesWithTime.length)
      : 0

    const pagesWithSize = pages.filter((p) => p.pageSize !== null)
    const avgPageSize = pagesWithSize.length
      ? Math.round(pagesWithSize.reduce((s, p) => s + (p.pageSize ?? 0), 0) / pagesWithSize.length)
      : 0

    const pagesWithImages = pages.filter((p) => p.totalImages !== null && p.totalImages > 0)
    const totalImgs = pagesWithImages.reduce((s, p) => s + (p.totalImages ?? 0), 0)
    const imgsWithAlt = pagesWithImages.reduce((s, p) => s + (p.imagesWithAlt ?? 0), 0)
    const imageOptRate = totalImgs > 0 ? Math.round((imgsWithAlt / totalImgs) * 100) : 100

    const slowestPages = [...pagesWithTime]
      .sort((a, b) => (b.responseTime ?? 0) - (a.responseTime ?? 0))
      .slice(0, 10)
      .map((p) => ({
        url: p.url,
        responseTime: p.responseTime,
        pageSize: p.pageSize,
        auditUrl: p.audit.url,
      }))

    return reply.send({
      avgScore,
      reports: reports.map((r) => ({
        auditId: r.auditId,
        url: r.audit.url,
        date: r.audit.createdAt,
        scorePerformance: r.scorePerformance,
      })),
      avgResponseTime,
      avgPageSize,
      imageOptRate,
      slowestPages,
    })
  })

  // ─────────────────────────────────────────────────────
  // GET /api/on-page-overview — Métriques on-page
  // ─────────────────────────────────────────────────────
  fastify.get("/api/on-page-overview", async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.userId
    const { projectId } = request.query as ProjectQuery

    if (projectId) {
      const project = await assertProjectOwner(projectId, userId, tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    const [reports, pages] = await Promise.all([
      prisma.auditReport.findMany({
        where: { audit: { tenantId, userId, deletedAt: null, status: "COMPLETED", ...(projectId ? { projectId } : {}) } },
        select: {
          scoreOnPage: true,
          auditId: true,
          audit: { select: { url: true, createdAt: true } },
        },
        orderBy: { audit: { createdAt: "desc" } },
      }),
      prisma.auditPage.findMany({
        where: completedAuditFilter(tenantId, userId, projectId),
        select: {
          url: true,
          titleLength: true,
          metaDescLength: true,
          h1: true,
          imagesWithoutAlt: true,
          audit: { select: { url: true } },
        },
      }),
    ])

    const avgScore = reports.length
      ? Math.round(reports.reduce((s, r) => s + r.scoreOnPage, 0) / reports.length)
      : 0

    let missingTitles = 0
    let missingMeta = 0
    let missingH1 = 0
    let missingAlt = 0

    const pageIssues: Array<{ url: string; issueCount: number; auditUrl: string }> = []

    for (const p of pages) {
      let issues = 0
      if (p.titleLength === null || p.titleLength === 0) { missingTitles++; issues++ }
      if (p.metaDescLength === null || p.metaDescLength === 0) { missingMeta++; issues++ }
      if (!p.h1 || p.h1.length === 0) { missingH1++; issues++ }
      if (p.imagesWithoutAlt !== null && p.imagesWithoutAlt > 0) { missingAlt++; issues++ }
      if (issues > 0) pageIssues.push({ url: p.url, issueCount: issues, auditUrl: p.audit.url })
    }

    const worstPages = pageIssues.sort((a, b) => b.issueCount - a.issueCount).slice(0, 10)

    return reply.send({
      avgScore,
      reports: reports.map((r) => ({
        auditId: r.auditId,
        url: r.audit.url,
        date: r.audit.createdAt,
        scoreOnPage: r.scoreOnPage,
      })),
      missingTitles,
      missingMeta,
      missingH1,
      missingAlt,
      worstPages,
    })
  })

  // ─────────────────────────────────────────────────────
  // GET /api/content-overview — Métriques contenu
  // ─────────────────────────────────────────────────────
  fastify.get("/api/content-overview", async (request, reply) => {
    const query = request.query as ContentQuery
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "50", 10) || 50))
    const skip = (page - 1) * limit
    const { projectId } = query

    if (projectId) {
      const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    type PageWhere = {
      audit: { tenantId: string; userId: string; deletedAt: null; status: "COMPLETED"; projectId?: string }
      wordCount?: { lt: number }
      OR?: Array<{ metaDescLength: null | { equals: number } }>
      h1?: { isEmpty: boolean }
    }

    const where: PageWhere = {
      audit: { tenantId: request.tenantId, userId: request.userId, deletedAt: null, status: "COMPLETED", ...(projectId ? { projectId } : {}) },
    }

    if (query.thin === "true") where.wordCount = { lt: 300 }
    if (query.noMeta === "true") where.OR = [{ metaDescLength: null }, { metaDescLength: { equals: 0 } }]
    if (query.noH1 === "true") where.h1 = { isEmpty: true }

    const [items, total] = await Promise.all([
      prisma.auditPage.findMany({
        where,
        select: {
          id: true,
          url: true,
          wordCount: true,
          title: true,
          titleLength: true,
          metaDescription: true,
          metaDescLength: true,
          h1: true,
          audit: { select: { id: true, url: true } },
        },
        orderBy: { wordCount: "asc" },
        skip,
        take: limit,
      }),
      prisma.auditPage.count({ where }),
    ])

    return reply.send({ items, total, page, totalPages: Math.ceil(total / limit) })
  })

  // ─────────────────────────────────────────────────────
  // GET /api/stats/timeline — Scores par audit dans le temps
  // ─────────────────────────────────────────────────────
  fastify.get("/api/stats/timeline", async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.userId
    const { projectId } = request.query as ProjectQuery

    if (projectId) {
      const project = await assertProjectOwner(projectId, userId, tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    const auditWhere = { tenantId, userId, deletedAt: null as null, status: "COMPLETED" as const, ...(projectId ? { projectId } : {}) }

    const [auditsWithReport, distribution] = await Promise.all([
      prisma.audit.findMany({
        where: auditWhere,
        select: {
          id: true,
          url: true,
          createdAt: true,
          report: {
            select: {
              scoreGlobal: true,
              scoreTechnical: true,
              scoreOnPage: true,
              scorePerformance: true,
              scoreUX: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.pageResult.groupBy({
        by: ["status"],
        where: { page: completedAuditFilter(tenantId, userId, projectId) },
        _count: { _all: true },
      }),
    ])

    const timeline = auditsWithReport
      .filter((a) => a.report !== null)
      .map((a) => ({
        auditId: a.id,
        url: a.url,
        date: a.createdAt,
        scoreGlobal: a.report!.scoreGlobal,
        scoreTechnical: a.report!.scoreTechnical,
        scoreOnPage: a.report!.scoreOnPage,
        scorePerformance: a.report!.scorePerformance,
        scoreUX: a.report!.scoreUX,
      }))

    const distMap: Record<string, number> = { PASS: 0, WARN: 0, FAIL: 0 }
    for (const d of distribution) distMap[d.status] = d._count._all

    return reply.send({
      timeline,
      distribution: {
        pass: distMap["PASS"] ?? 0,
        warn: distMap["WARN"] ?? 0,
        fail: distMap["FAIL"] ?? 0,
      },
    })
  })

  // ─────────────────────────────────────────────────────
  // GET /api/optimization — Recommandations agrégées
  // ─────────────────────────────────────────────────────
  fastify.get("/api/optimization", async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.userId
    const { projectId } = request.query as ProjectQuery

    if (projectId) {
      const project = await assertProjectOwner(projectId, userId, tenantId)
      if (!project) return reply.status(403).send({ error: "Accès refusé" })
    }

    const grouped = await prisma.pageResult.groupBy({
      by: ["checkName", "category", "status", "priority", "effort", "message"],
      where: {
        page: completedAuditFilter(tenantId, userId, projectId),
        status: { in: ["FAIL", "WARN"] },
      },
      _count: { _all: true },
    })

    type RecommendationEntry = {
      checkName: string
      category: string
      failCount: number
      warnCount: number
      priority: string
      effort: string
      message: string
    }

    const checkMap = new Map<string, RecommendationEntry>()

    for (const g of grouped) {
      const existing = checkMap.get(g.checkName)
      const count = g._count._all

      if (existing) {
        if (g.status === "FAIL") existing.failCount += count
        if (g.status === "WARN") existing.warnCount += count
        if ((severityWeight[g.priority] ?? 0) > (severityWeight[existing.priority] ?? 0)) {
          existing.priority = g.priority
        }
      } else {
        checkMap.set(g.checkName, {
          checkName: g.checkName,
          category: g.category,
          failCount: g.status === "FAIL" ? count : 0,
          warnCount: g.status === "WARN" ? count : 0,
          priority: g.priority,
          effort: g.effort,
          message: g.message,
        })
      }
    }

    const recommendations = [...checkMap.values()]
      .map((r) => ({
        ...r,
        impactScore: (r.failCount * 3 + r.warnCount) * (severityWeight[r.priority] ?? 1),
      }))
      .sort((a, b) => b.impactScore - a.impactScore)

    return reply.send({ recommendations })
  })
}

export default aggregationRoutes
