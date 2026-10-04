// routes/rank-tracking.ts — Suivi de positions Google via Playwright
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { chromium } from "playwright"
import { parseGoogleRankHtml } from "@seo/crawler"
import { resolveFeature } from "../lib/features"
import { prisma } from "../lib/prisma.js"
import { requireRole, requireFeature, assertProjectOwner } from "../lib/guards.js"
import { fulfillPublicRequest } from "@seo/shared/security"

const AddKeywordSchema = z.object({
  keyword: z.string().min(1).max(200),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  country: z.string().regex(/^[a-zA-Z]{2}$/).transform((value) => value.toLowerCase()).default("fr"),
  projectId: z.string().optional(),
})

// Bound Chromium processes even when clients launch simultaneous checks.
let activePositionChecks = 0
// ── Scraping Google SERP avec matching domaine ────────────────────────────────
async function checkPosition(
  keyword: string,
  targetDomain: string,
  device: "desktop" | "mobile",
  country: string
): Promise<{ position: number | null; url: string | null; title: string | null; resultCount: number }> {
  if (activePositionChecks >= 2) throw new Error("Vérifications en cours, réessayer plus tard")
  activePositionChecks++
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, chromiumSandbox: process.env.NODE_ENV === "production" })
    const context = await browser.newContext({
      serviceWorkers: "block",
      userAgent:
        device === "mobile"
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      viewport: device === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      locale: `fr-${country.toUpperCase()}`,
      extraHTTPHeaders: { "Accept-Language": `fr-${country.toUpperCase()},fr;q=0.9` },
    })
    await context.route("**/*", (route) => fulfillPublicRequest(route).then(() => {}))
    await context.routeWebSocket("**/*", (socket) => socket.close())
    const page = await context.newPage()

    // Délai aléatoire pour éviter le blocage
    await new Promise((r) => setTimeout(r, Math.random() * 1500 + 500))

    const query = encodeURIComponent(keyword)
    await page.goto(
      `https://www.google.fr/search?q=${query}&num=100&hl=fr&gl=${country}&pws=0&filter=0`,
      { waitUntil: "domcontentloaded", timeout: 20000 }
    )

    if (new URL(page.url()).pathname.startsWith("/sorry")) throw new Error("Google blocked")
    await page.waitForSelector("#search h3, #rso h3", { timeout: 10000 })
    return parseGoogleRankHtml(await page.content(), targetDomain)
  } finally {
    await browser?.close().catch(() => {})
    activePositionChecks--
  }
}


async function checkAndSave(id: string, tenantId: string, userId: string, domain: string) {
  const attempt = new Date()
  const keyword = await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM ranked_keywords WHERE id=$1 AND "tenantId"=$2 FOR UPDATE', id, tenantId)
    const row = await tx.rankedKeyword.findFirst({ where: { id, tenantId, project: { userId, deletedAt: null } } })
    if (!row || row.lastCheckStatus === "RUNNING" && row.lastAttemptAt && row.lastAttemptAt > new Date(Date.now()-120000)) return null
    const [user, tenant] = await Promise.all([tx.user.findFirst({ where: { id: userId, tenantId, isBanned: false, role: { in: ["MEMBER", "ADMIN"] } } }), tx.tenant.findFirst({ where: { id: tenantId, isSuspended: false } })])
    if (!user || !tenant) return null
    await tx.rankedKeyword.update({ where: { id }, data: { lastCheckStatus: "RUNNING", lastAttemptAt: attempt, lastCheckMessage: null } })
    return row
  })
  if (!keyword) return
  try {
    if (!await resolveFeature(tenantId, "rank_tracking")) throw new Error("Access revoked")
    const result = await checkPosition(keyword.keyword, domain, keyword.device as "desktop" | "mobile", keyword.country)
    await prisma.$transaction(async tx => {
      const user = await tx.user.findFirst({ where: { id: userId, tenantId, isBanned: false, role: { in: ["MEMBER", "ADMIN"] } } })
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId, isSuspended: false } })
      if (!user || !tenant) throw new Error("Access revoked")
      const claimed = await tx.rankedKeyword.updateMany({ where: { id, tenantId, lastAttemptAt: attempt, lastCheckStatus: "RUNNING", project: { userId, deletedAt: null } }, data: { lastCheckStatus: "COMPLETED", lastCheckMessage: null } })
      if (claimed.count !== 1) return
      await tx.rankHistory.create({ data: { tenantId, keywordId: id, ...result } })
    })
  } catch {
    await prisma.rankedKeyword.updateMany({ where: { id, tenantId, lastAttemptAt: attempt, lastCheckStatus: "RUNNING" }, data: { lastCheckStatus: "FAILED", lastCheckMessage: "Google n’a pas fourni de résultats exploitables. La dernière mesure confirmée est conservée." } })
  }
}

const rankTrackingRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/rank-tracking — Liste des mots-clés suivis avec dernière position
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/api/rank-tracking",
    async (request, reply) => {
      const { projectId } = request.query

      if (projectId) {
        const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
        if (!project) return reply.status(403).send({ error: "Accès refusé" })
      }

      // Si pas de projectId : limiter aux projets de l'utilisateur
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

      await prisma.rankedKeyword.updateMany({ where: { tenantId: request.tenantId, ...projectFilter, lastCheckStatus: "RUNNING", lastAttemptAt: { lt: new Date(Date.now()-120000) } }, data: { lastCheckStatus: "FAILED", lastCheckMessage: "Vérification interrompue. Relancez la mesure." } })
      const keywords = await prisma.rankedKeyword.findMany({
        where: {
          tenantId: request.tenantId,
          ...projectFilter,
        },
        include: {
          history: {
            orderBy: { checkedAt: "desc" },
            take: 2, // dernière + avant-dernière pour la variation
          },
        },
        orderBy: { createdAt: "desc" },
      })

      const result = keywords.map((kw) => {
        const last = kw.history[0] ?? null
        const prev = kw.history[1] ?? null
        const change =
          last?.position != null && prev?.position != null && last.resultCount > 0 && prev.resultCount > 0
            ? prev.position - last.position // positif = monté
            : null
        return {
          id: kw.id,
          keyword: kw.keyword,
          device: kw.device,
          country: kw.country,
          projectId: kw.projectId,
          position: last?.position ?? null,
          url: last?.url ?? null,
          title: last?.title ?? null,
          change,
          checkedAt: last?.checkedAt ?? null,
          lastCheckStatus: kw.lastCheckStatus, lastCheckMessage: kw.lastCheckMessage, lastAttemptAt: kw.lastAttemptAt, resultCount: last?.resultCount ?? 0,
          history: kw.history.map((h) => ({
            position: h.position,
            checkedAt: h.checkedAt,
          })),
        }
      })

      // Stats
      const tracked = result.length
      const withPosition = result.filter((k) => k.position !== null && k.resultCount > 0)
      const avgPosition =
        withPosition.length > 0
          ? Math.round((withPosition.reduce((s, k) => s + k.position!, 0) / withPosition.length) * 10) / 10
          : null
      const top10 = withPosition.filter((k) => k.position! <= 10).length
      const top3 = withPosition.filter((k) => k.position! <= 3).length

      return reply.send({ keywords: result, stats: { tracked, avgPosition, top10, top3 } })
    }
  )

  // POST /api/rank-tracking — Ajouter un mot-clé
  fastify.post(
    "/api/rank-tracking",
    { preHandler: [requireRole("MEMBER"), requireFeature("rank_tracking")] },
    async (request, reply) => {
      const parse = AddKeywordSchema.safeParse(request.body)
      if (!parse.success) return reply.status(400).send({ error: "Données invalides" })
      const { keyword, device, country, projectId } = parse.data

      // Valider que le projectId appartient à l'utilisateur
      if (projectId) {
        const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
        if (!project) return reply.status(403).send({ error: "Accès refusé" })
      }

      // Vérifier quota : max 50 mots-clés par tenant
      const count = await prisma.rankedKeyword.count({ where: { tenantId: request.tenantId } })
      if (count >= 50) return reply.status(429).send({ error: "Quota de 50 mots-clés atteint" })

      const kw = await prisma.rankedKeyword.upsert({
        where: {
          tenantId_keyword_device_country: {
            tenantId: request.tenantId,
            keyword,
            device,
            country,
          },
        },
        create: {
          tenantId: request.tenantId,
          keyword,
          device,
          country,
          projectId: projectId ?? null,
        },
        update: {},
      })

      return reply.status(201).send(kw)
    }
  )

  // DELETE /api/rank-tracking/:id — Supprimer un mot-clé
  fastify.delete<{ Params: { id: string } }>(
    "/api/rank-tracking/:id",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const kw = await prisma.rankedKeyword.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId, project: { userId: request.userId } },
      })
      if (!kw) return reply.status(404).send({ error: "Mot-clé introuvable" })
      await prisma.rankedKeyword.delete({ where: { id: kw.id } })
      return reply.status(204).send()
    }
  )

  // POST /api/rank-tracking/:id/check — Lancer une vérification de position
  fastify.post<{ Params: { id: string }; Body: { domain?: string } }>(
    "/api/rank-tracking/:id/check",
    { preHandler: [requireRole("MEMBER"), requireFeature("rank_tracking")] },
    async (request, reply) => {
      const kw = await prisma.rankedKeyword.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId, project: { userId: request.userId } },
        include: { project: { select: { domain: true } } },
      })
      if (!kw) return reply.status(404).send({ error: "Mot-clé introuvable" })

      const domain = request.body?.domain || kw.project?.domain
      if (!domain) return reply.status(400).send({ error: "Domaine requis (project.domain ou body.domain)" })

      // Scraper en arrière-plan (réponse immédiate)
      reply.status(202).send({ message: "Vérification lancée", keywordId: kw.id })

      // Scraping asynchrone
      setImmediate(async () => {
        try {
          await checkAndSave(kw.id, request.tenantId, request.userId, domain)
        } catch (err) {
          fastify.log.error({ err }, "Erreur scraping rank")
        }
      })
    }
  )

  // POST /api/rank-tracking/check-all — Vérifier tous les mots-clés d'un projet
  fastify.post<{ Body: { domain?: string; projectId?: string } }>(
    "/api/rank-tracking/check-all",
    { preHandler: [requireRole("MEMBER"), requireFeature("rank_tracking")] },
    async (request, reply) => {
      const { domain, projectId } = request.body ?? {}

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

      const keywords = await prisma.rankedKeyword.findMany({
        where: {
          tenantId: request.tenantId,
          ...projectFilter,
        },
        include: { project: { select: { domain: true } } },
      })

      reply.status(202).send({ message: `${keywords.length} vérifications lancées` })

      // Scraping séquentiel avec délai pour éviter le blocage
      setImmediate(async () => {
        for (const kw of keywords) {
          const targetDomain = domain || kw.project?.domain
          if (!targetDomain) continue
          try {
            await checkAndSave(kw.id, request.tenantId, request.userId, targetDomain)
            // Délai entre chaque requête Google
            await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000))
          } catch (err) {
            fastify.log.error({ err }, `Erreur scraping rank pour "${kw.keyword}"`)
          }
        }
      })
    }
  )
}

export default rankTrackingRoutes
