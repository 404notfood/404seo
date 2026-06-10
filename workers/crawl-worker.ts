// workers/crawl-worker.ts — Worker BullMQ crawl + analyse + scoring
import { config } from "dotenv"
import { resolve } from "path"

// Charger le .env depuis le dossier workers/ (indépendant du cwd PM2)
config({ path: resolve(process.cwd(), "workers/.env") })
// Fallback : si lancé depuis workers/
config({ path: resolve(process.cwd(), ".env") })
import { Worker, Queue, Job } from "bullmq"
import type { RedisOptions } from "ioredis"
import { PrismaClient } from "@prisma/client"
import pino from "pino"
import { SEOCrawler } from "@seo/crawler"
import { analyzePage, type AnalysisResult, type CheckResult } from "@seo/analyzer"
import { calculateGlobalScore, generateRecommendations } from "@seo/scorer"
import type { CrawlJobData, AnalyzeJobData, ReportJobData } from "@seo/shared"
import { aggregateSiteKeywords } from "@seo/shared"
import type { KeywordEntry } from "@seo/shared"

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } },
  }),
})

// ─────────────────────────────────────────────
// Redis + Prisma
// ─────────────────────────────────────────────

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
} satisfies RedisOptions

const prisma = new PrismaClient()

// ─────────────────────────────────────────────
// Queues
// ─────────────────────────────────────────────

export const crawlQueue = new Queue("crawl", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

export const analyzeQueue = new Queue("analyze", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

export const reportQueue = new Queue("report", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
})

// ─────────────────────────────────────────────
// Worker CRAWL
// ─────────────────────────────────────────────

const crawlWorker = new Worker<CrawlJobData>(
  "crawl",
  async (job: Job<CrawlJobData>) => {
    const { auditId, url, options } = job.data

    await prisma.audit.update({
      where: { id: auditId },
      data: { status: "CRAWLING" },
    })
    await prisma.auditJob.updateMany({
      where: { auditId, type: "CRAWL" },
      data: { status: "RUNNING", startedAt: new Date() },
    })

    const crawlConcurrency = 5
    const crawler = new SEOCrawler({
      maxPages: options.maxPages ?? 100,
      maxDepth: options.maxDepth ?? 5,
      device: options.device ?? "desktop",
      respectRobots: true,
      concurrency: crawlConcurrency,
    })

    await crawler.launch()

    try {
      // Garde-fou : un crawl ne doit jamais bloquer le worker indéfiniment.
      // Crawl parallèle (concurrency pages simultanées) → budget ~6s/page divisé
      // par la concurrence, borné entre 5 et 20 min.
      const maxPagesPlanned = options.maxPages ?? 100
      const perPageBudget = Math.ceil((maxPagesPlanned * 6_000) / crawlConcurrency)
      const crawlTimeoutMs = Math.min(20 * 60_000, Math.max(5 * 60_000, perPageBudget))
      const pages = await Promise.race([
        crawler.crawlSite(url, async (crawled, total) => {
          await job.updateProgress(total > 0 ? Math.round((crawled / total) * 50) : 0)
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Crawl timeout après ${Math.round(crawlTimeoutMs / 60000)} min`)), crawlTimeoutMs)
        ),
      ])

      const savedPageIds: string[] = []
      for (const page of pages) {
        const saved = await prisma.auditPage.create({
          data: {
            auditId,
            url: page.url,
            statusCode: page.statusCode,
            redirectUrl: page.redirectUrl,
            responseTime: page.responseTime,
            pageSize: page.pageSize,
            isIndexable: page.isIndexable,
            hasCanonical: !!page.canonicalUrl,
            canonicalUrl: page.canonicalUrl,
            title: page.title,
            titleLength: page.title?.length,
            metaDescription: page.metaDescription,
            metaDescLength: page.metaDescription?.length,
            h1: page.h1,
            headings: page.headings,
            totalImages: page.images.length,
            imagesWithAlt: page.images.filter((i) => i.hasAlt).length,
            imagesWithoutAlt: page.images.filter((i) => !i.hasAlt).length,
            internalLinks: page.internalLinks.length,
            externalLinks: page.externalLinks.length,
            // URLs réelles (bornées pour éviter des lignes énormes sur les pages à très nombreux liens)
            internalLinkUrls: page.internalLinks.slice(0, 500),
            externalLinkUrls: page.externalLinks.slice(0, 500),
            hasSchemaOrg: page.schemaOrgTypes.length > 0,
            schemaTypes: page.schemaOrgTypes,
            lang: page.lang,
            ogTitle: page.ogTags?.title,
            ogDescription: page.ogTags?.description,
            ogImage: page.ogTags?.image,
            ogType: page.ogTags?.type,
            wordCount: page.wordCount,
            hasRobotsTxt: page.hasRobotsTxt,
            hasSitemap: page.hasSitemap,
            metaRobots: page.metaRobots,
            hasViewport: page.hasViewport,
            hasResponsiveMeta: page.hasResponsiveMeta,
            smallTapTargets: page.smallTapTargets,
            smallFontSizes: page.smallFontSizes,
            topKeywords: JSON.parse(JSON.stringify(page.topKeywords ?? [])),
          },
        })
        savedPageIds.push(saved.id)
      }

      await prisma.auditJob.updateMany({
        where: { auditId, type: "CRAWL" },
        data: { status: "COMPLETED", finishedAt: new Date(), progress: 100 },
      })

      await analyzeQueue.add("analyze", { auditId, pageIds: savedPageIds })

      return { pagesCount: pages.length }
    } finally {
      await crawler.close()
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: { max: 10, duration: 60000 },
  }
)

// ─────────────────────────────────────────────
// Worker ANALYZE
// ─────────────────────────────────────────────

const analyzeWorker = new Worker<AnalyzeJobData>(
  "analyze",
  async (job: Job<AnalyzeJobData>) => {
    const { auditId, pageIds } = job.data

    await prisma.audit.update({
      where: { id: auditId },
      data: { status: "ANALYZING" },
    })

    const pages = await prisma.auditPage.findMany({
      where: { id: { in: pageIds } },
    })

    let processedCount = 0

    for (const page of pages) {
      const ogTags = (page.ogTitle || page.ogDescription || page.ogImage || page.ogType)
        ? { title: page.ogTitle ?? undefined, description: page.ogDescription ?? undefined, image: page.ogImage ?? undefined, type: page.ogType ?? undefined }
        : undefined

      const pageData = {
        url: page.url,
        statusCode: page.statusCode ?? 0,
        redirectUrl: page.redirectUrl ?? undefined,
        responseTime: page.responseTime ?? 0,
        pageSize: page.pageSize ?? 0,
        title: page.title ?? undefined,
        metaDescription: page.metaDescription ?? undefined,
        h1: page.h1,
        headings: (page.headings as { h2: string[]; h3: string[]; h4: string[] }) ??
          { h2: [], h3: [], h4: [] },
        canonicalUrl: page.canonicalUrl ?? undefined,
        metaRobots: page.metaRobots ?? undefined,
        isIndexable: page.isIndexable ?? true,
        images: Array.from({ length: page.totalImages ?? 0 }, (_, i) => ({
          src: "",
          hasAlt: i < (page.imagesWithAlt ?? 0),
        })),
        internalLinks: Array.from({ length: page.internalLinks ?? 0 }, () => "https://internal.placeholder"),
        externalLinks: Array.from({ length: page.externalLinks ?? 0 }, () => "https://external.placeholder"),
        schemaOrgTypes: page.schemaTypes,
        hasViewport: page.hasViewport ?? false,
        lang: page.lang ?? undefined,
        ogTags,
        wordCount: page.wordCount ?? undefined,
        hasRobotsTxt: page.hasRobotsTxt ?? undefined,
        hasSitemap: page.hasSitemap ?? undefined,
        hasResponsiveMeta: page.hasResponsiveMeta ?? undefined,
        smallTapTargets: page.smallTapTargets ?? undefined,
        smallFontSizes: page.smallFontSizes ?? undefined,
      }

      const analysis = analyzePage(pageData)
      const allChecks = [...analysis.technical, ...analysis.onPage, ...analysis.performance, ...analysis.uxMobile]

      await prisma.pageResult.createMany({
        data: allChecks.map((check) => ({
          pageId: page.id,
          category: check.category,
          checkName: check.checkName,
          status: check.status,
          score: check.score,
          value: check.value,
          expected: check.expected,
          message: check.message,
          priority: check.priority,
          effort: check.effort,
        })),
      })

      processedCount++
      await job.updateProgress(50 + Math.round((processedCount / pages.length) * 40))
    }

    await reportQueue.add("report", { auditId })

    return { pagesAnalyzed: processedCount }
  },
  {
    connection: redisConnection,
    concurrency: 4,
  }
)

// ─────────────────────────────────────────────
// Worker REPORT (scoring global)
// ─────────────────────────────────────────────

const reportWorker = new Worker<ReportJobData>(
  "report",
  async (job: Job<ReportJobData>) => {
    const { auditId } = job.data

    await prisma.audit.update({
      where: { id: auditId },
      data: { status: "SCORING" },
    })

    // Récupérer tous les résultats
    const pageResults = await prisma.pageResult.findMany({
      where: { page: { auditId } },
    })
    const toCheckResult = (r: (typeof pageResults)[number]): CheckResult => ({
      category: r.category,
      checkName: r.checkName,
      status: r.status,
      score: r.score,
      value: r.value ?? undefined,
      expected: r.expected ?? undefined,
      message: r.message,
      priority: r.priority,
      effort: r.effort,
    })

    const technical = pageResults.filter((r) => r.category === "TECHNICAL")
    const onPage = pageResults.filter((r) => r.category === "ON_PAGE")
    const performance = pageResults.filter((r) => r.category === "PERFORMANCE")
    const uxMobile = pageResults.filter((r) => r.category === "UX_MOBILE")

    const analysis: AnalysisResult = {
      technical: technical.map(toCheckResult),
      onPage: onPage.map(toCheckResult),
      performance: performance.map(toCheckResult),
      uxMobile: uxMobile.map(toCheckResult),
    }

    const score = calculateGlobalScore(analysis)
    const totalPages = await prisma.auditPage.count({ where: { auditId } })

    // Aggregate keywords from all pages
    const pagesWithKeywords = await prisma.auditPage.findMany({
      where: { auditId },
      select: { url: true, topKeywords: true },
    })
    const siteKeywords = aggregateSiteKeywords(
      pagesWithKeywords.map((p) => ({
        url: p.url,
        topKeywords: (p.topKeywords as KeywordEntry[] | null) ?? [],
      })),
      totalPages
    )

    await prisma.auditReport.create({
      data: {
        auditId,
        scoreGlobal: score.global,
        scoreTechnical: score.technical,
        scoreOnPage: score.onPage,
        scorePerformance: score.performance,
        scoreUX: score.uxMobile,
        totalPages,
        totalIssues: score.criticalIssues.length + score.warnings.length,
        criticalIssues: score.criticalIssues.length,
        warnings: score.warnings.length,
        passed: score.passed.length,
        aiSuggestions: JSON.parse(JSON.stringify({ keywords: siteKeywords })),
      },
    })

    await prisma.audit.update({
      where: { id: auditId },
      data: { status: "COMPLETED", completedAt: new Date() },
    })

    // Déduire les pages crawlées du quota + notifier par email
    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      select: { tenantId: true, url: true, userId: true },
    })
    if (audit?.tenantId) {
      await prisma.subscription.updateMany({
        where: { tenantId: audit.tenantId },
        data: { pagesUsed: { increment: totalPages } },
      })

      // Envoyer email de notification si Resend configuré
      try {
        const user = await prisma.user.findUnique({
          where: { id: audit.userId },
          select: { email: true },
        })
        if (user?.email && process.env.RESEND_API_KEY) {
          const scoreColor = score.global >= 80 ? "#22c55e" : score.global >= 50 ? "#f59e0b" : "#ef4444"
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://seo.404notfood.fr"
          const safeAuditUrl = audit.url
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;")
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM || "404 SEO <noreply@seo.404notfood.fr>",
              to: user.email,
              subject: `Audit terminé : ${audit.url} — Score ${score.global}/100`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0f172a;color:#f1f5f9;">
                <h1 style="color:#2563eb;">404 SEO</h1>
                <h2>Votre audit est terminé !</h2>
                <p style="color:#94a3b8;">Résultats pour <strong style="color:#f1f5f9;">${safeAuditUrl}</strong></p>
                <div style="text-align:center;margin:32px 0;">
                  <span style="font-size:48px;font-weight:bold;color:${scoreColor};">${score.global}/100</span>
                  <p style="color:${scoreColor};font-size:20px;">Grade ${score.grade}</p>
                </div>
                <div style="text-align:center;margin:32px 0;">
                  <a href="${appUrl}/audits/${auditId}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Voir les détails</a>
                </div>
              </div>`,
            }),
          }).catch((err) => logger.error({ err }, "Erreur envoi email notification"))
        }
      } catch (err) {
        logger.error({ err }, "Erreur envoi email notification audit")
      }
    }

    return { score: score.global, grade: score.grade }
  },
  {
    connection: redisConnection,
    concurrency: 4,
  }
)

// ─────────────────────────────────────────────
// Gestion des erreurs
// ─────────────────────────────────────────────

crawlWorker.on("failed", async (job, err) => {
  if (!job) return
  logger.error({ jobId: job.id, auditId: job.data.auditId, err: err.message }, "Crawl job failed")
  await prisma.audit.update({
    where: { id: job.data.auditId },
    data: { status: "FAILED" },
  })
})

analyzeWorker.on("failed", async (job, err) => {
  if (!job) return
  logger.error({ jobId: job.id, auditId: job.data.auditId, err: err.message }, "Analyze job failed")
  try {
    await prisma.audit.update({
      where: { id: job.data.auditId },
      data: { status: "FAILED" },
    })
    await prisma.auditJob.updateMany({
      where: { auditId: job.data.auditId, type: "ANALYZE" },
      data: { status: "FAILED", error: err.message, finishedAt: new Date() },
    })
  } catch { /* best effort */ }
})

reportWorker.on("failed", async (job, err) => {
  if (!job) return
  logger.error({ jobId: job.id, auditId: job.data.auditId, err: err.message }, "Report job failed")
  try {
    await prisma.audit.update({
      where: { id: job.data.auditId },
      data: { status: "FAILED" },
    })
    await prisma.auditJob.updateMany({
      where: { auditId: job.data.auditId, type: "REPORT" },
      data: { status: "FAILED", error: err.message, finishedAt: new Date() },
    })
  } catch { /* best effort */ }
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Workers shutting down...")
  await Promise.all([
    crawlWorker.close(),
    analyzeWorker.close(),
    reportWorker.close(),
  ])
  await prisma.$disconnect()
  logger.info("Workers stopped gracefully")
})

logger.info("Workers started — waiting for jobs...")
