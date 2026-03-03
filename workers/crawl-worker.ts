// workers/crawl-worker.ts — Worker BullMQ crawl + analyse + scoring
import "dotenv/config"
import { Worker, Queue, Job } from "bullmq"
import { PrismaClient } from "@prisma/client"
import { SEOCrawler } from "@seo/crawler"
import { analyzePage } from "@seo/analyzer"
import { calculateGlobalScore, generateRecommendations } from "@seo/scorer"
import type { CrawlJobData, AnalyzeJobData, ReportJobData } from "@seo/shared"

// ─────────────────────────────────────────────
// Redis + Prisma
// ─────────────────────────────────────────────

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null as unknown as undefined,
}

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

    const crawler = new SEOCrawler({
      maxPages: options.maxPages ?? 100,
      maxDepth: options.maxDepth ?? 5,
      device: options.device ?? "desktop",
      respectRobots: true,
    })

    await crawler.launch()

    try {
      const pages = await crawler.crawlSite(url, async (crawled, total) => {
        await job.updateProgress(Math.round((crawled / total) * 50))
      })

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
            rawHtml: page.rawHtml?.substring(0, 50000),
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

    const technical = pageResults.filter((r) => r.category === "TECHNICAL")
    const onPage = pageResults.filter((r) => r.category === "ON_PAGE")
    const performance = pageResults.filter((r) => r.category === "PERFORMANCE")
    const uxMobile = pageResults.filter((r) => r.category === "UX_MOBILE")

    const analysis = {
      technical: technical.map((r) => ({
        category: r.category as any,
        checkName: r.checkName,
        status: r.status as any,
        score: r.score,
        value: r.value ?? undefined,
        expected: r.expected ?? undefined,
        message: r.message,
        priority: r.priority as any,
        effort: r.effort as any,
      })),
      onPage: onPage.map((r) => ({
        category: r.category as any,
        checkName: r.checkName,
        status: r.status as any,
        score: r.score,
        value: r.value ?? undefined,
        expected: r.expected ?? undefined,
        message: r.message,
        priority: r.priority as any,
        effort: r.effort as any,
      })),
      performance: performance.map((r) => ({
        category: r.category as any,
        checkName: r.checkName,
        status: r.status as any,
        score: r.score,
        value: r.value ?? undefined,
        expected: r.expected ?? undefined,
        message: r.message,
        priority: r.priority as any,
        effort: r.effort as any,
      })),
      uxMobile: uxMobile.map((r) => ({
        category: r.category as any,
        checkName: r.checkName,
        status: r.status as any,
        score: r.score,
        value: r.value ?? undefined,
        expected: r.expected ?? undefined,
        message: r.message,
        priority: r.priority as any,
        effort: r.effort as any,
      })),
    }

    const score = calculateGlobalScore(analysis)
    const totalPages = await prisma.auditPage.count({ where: { auditId } })

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
      },
    })

    await prisma.audit.update({
      where: { id: auditId },
      data: { status: "COMPLETED", completedAt: new Date() },
    })

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
  console.error(`[CRAWL] Job ${job.id} échoué:`, err.message)
  await prisma.audit.update({
    where: { id: job.data.auditId },
    data: { status: "FAILED" },
  })
})

analyzeWorker.on("failed", async (job, err) => {
  if (!job) return
  console.error(`[ANALYZE] Job ${job.id} échoué:`, err.message)
})

reportWorker.on("failed", async (job, err) => {
  if (!job) return
  console.error(`[REPORT] Job ${job.id} échoué:`, err.message)
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[WORKERS] Arrêt en cours...")
  await Promise.all([
    crawlWorker.close(),
    analyzeWorker.close(),
    reportWorker.close(),
  ])
  await prisma.$disconnect()
  console.log("[WORKERS] Arrêté proprement.")
})

console.log("[WORKERS] Démarré — en attente de jobs...")
