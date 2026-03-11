// workers/schedule-worker.ts — Worker cron pour déclencher les audits planifiés
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(process.cwd(), "workers/.env") })
config({ path: resolve(process.cwd(), ".env") })

import { Queue } from "bullmq"
import { PrismaClient } from "@prisma/client"
import pino from "pino"

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } },
  }),
})

const redisConnection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maxRetriesPerRequest: null as any,
}

const prisma = new PrismaClient()
const crawlQueue = new Queue("crawl", { connection: redisConnection })

async function checkScheduledAudits() {
  const now = new Date()

  // Trouver les audits planifiés dont nextRunAt est passé
  const due = await prisma.scheduledAudit.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    include: {
      project: { select: { domain: true } },
    },
  })

  if (due.length === 0) return

  logger.info({ count: due.length }, "Scheduled audits à lancer")

  for (const schedule of due) {
    try {
      const options = (schedule.options as Record<string, unknown>) ?? {}
      const maxPages = (options.maxPages as number) ?? 100

      // Vérifier le quota pages
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId: schedule.tenantId },
      })
      const pagesUsed = subscription?.pagesUsed ?? 0
      const pagesQuota = subscription?.pagesQuota ?? 100
      if (pagesUsed + maxPages > pagesQuota) {
        logger.warn({ scheduleId: schedule.id, tenantId: schedule.tenantId }, "Quota pages dépassé, skip")
        continue
      }

      // Créer l'audit
      const audit = await prisma.audit.create({
        data: {
          tenantId: schedule.tenantId,
          userId: schedule.userId,
          projectId: schedule.projectId,
          url: schedule.project.domain,
          status: "PENDING",
          options: schedule.options ?? {},
        },
      })

      await prisma.auditJob.create({
        data: { auditId: audit.id, type: "CRAWL", status: "QUEUED" },
      })

      await crawlQueue.add("crawl" as never, {
        auditId: audit.id,
        url: schedule.project.domain,
        options: schedule.options ?? {},
      })

      // Calculer le prochain run
      const nextRunAt = new Date(now)
      if (schedule.frequency === "weekly") {
        nextRunAt.setDate(nextRunAt.getDate() + 7)
      } else {
        nextRunAt.setMonth(nextRunAt.getMonth() + 1)
      }

      await prisma.scheduledAudit.update({
        where: { id: schedule.id },
        data: { lastRunAt: now, nextRunAt },
      })

      logger.info({ scheduleId: schedule.id, auditId: audit.id }, "Scheduled audit lancé")
    } catch (err) {
      logger.error({ scheduleId: schedule.id, err }, "Erreur scheduled audit")
    }
  }
}

// ─── Digest hebdo GA4 + GSC ──────────────────────────────────────────────────

const RESEND_API_KEY = () => process.env.RESEND_API_KEY || ""
const FROM_EMAIL = () => process.env.EMAIL_FROM || "404 SEO <noreply@seo.404notfood.fr>"
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://seo.404notfood.fr"

// Stocke la dernière exécution du digest pour ne le faire qu'une fois par semaine
let lastDigestRun: Date | null = null

// Rafraîchir un access_token via Google OAuth2 (fetch HTTP, pas de SDK)
async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })
    if (!res.ok) return null
    return res.json() as Promise<{ access_token: string; expires_in: number }>
  } catch {
    return null
  }
}

// Appel GA4 Data API via fetch HTTP
async function fetchGA4Report(accessToken: string, propertyId: string, startDate: string, endDate: string, metrics: string[]) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: metrics.map((name) => ({ name })),
    }),
  })
  if (!res.ok) throw new Error(`GA4 API ${res.status}`)
  return res.json()
}

// Lister les propriétés GA4 via Admin API
async function listGA4Properties(accessToken: string): Promise<string | null> {
  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/-&pageSize=1", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.properties?.[0]?.name ?? null
}

// Appel GSC via fetch HTTP
async function fetchGSCQueries(accessToken: string, siteUrl: string, startDate: string, endDate: string) {
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 10,
    }),
  })
  if (!res.ok) return []
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.rows ?? []).map((row: any) => ({
    query: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    position: Math.round((row.position ?? 0) * 10) / 10,
  }))
}

async function sendWeeklyGADigests() {
  const now = new Date()

  // Ne lancer que le lundi entre 8h et 9h (UTC)
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 8 || now.getUTCHours() >= 9) return
  // Éviter de relancer si déjà fait cette semaine
  if (lastDigestRun && now.getTime() - lastDigestRun.getTime() < 6 * 24 * 3600 * 1000) return

  logger.info("Début de l'envoi des digests hebdo GA")
  lastDigestRun = now

  // Trouver tous les GoogleAccount avec scopes analytics
  const accounts = await prisma.googleAccount.findMany({
    where: {
      scopes: { has: "https://www.googleapis.com/auth/analytics.readonly" },
    },
    include: {
      tenant: {
        include: {
          users: {
            where: { role: { in: ["ADMIN", "MEMBER"] } },
            select: { email: true, name: true },
            take: 5,
          },
          projects: {
            select: { domain: true, name: true },
            take: 1,
          },
        },
      },
    },
  })

  if (accounts.length === 0) {
    logger.info("Aucun compte GA connecté, skip digest")
    return
  }

  for (const account of accounts) {
    try {
      let accessToken = account.accessToken

      // Rafraîchir le token si expiré
      if (account.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
        const refreshed = await refreshGoogleToken(account.refreshToken)
        if (!refreshed) {
          logger.warn({ accountId: account.id }, "Impossible de rafraîchir le token GA")
          continue
        }
        accessToken = refreshed.access_token
        await prisma.googleAccount.update({
          where: { id: account.id },
          data: {
            accessToken,
            tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000),
          },
        })
      }

      // Le domaine du premier projet du tenant (pour Search Console)
      const siteDomain = account.tenant.projects[0]?.domain
      const siteName = account.tenant.projects[0]?.name || account.tenant.name

      // Récupérer les données GA4 (7 derniers jours)
      let ga4Data = { sessions: 0, users: 0, pageviews: 0, bounceRate: 0, avgDuration: 0, sessionsChange: undefined as number | undefined }
      try {
        const propertyId = await listGA4Properties(accessToken)

        if (propertyId) {
          // Semaine courante
          const currentWeek = await fetchGA4Report(
            accessToken, propertyId, "7daysAgo", "today",
            ["sessions", "totalUsers", "screenPageViews", "bounceRate", "averageSessionDuration"]
          )

          const totals = currentWeek.totals?.[0]?.metricValues
          if (totals) {
            ga4Data.sessions = parseInt(totals[0]?.value ?? "0")
            ga4Data.users = parseInt(totals[1]?.value ?? "0")
            ga4Data.pageviews = parseInt(totals[2]?.value ?? "0")
            ga4Data.bounceRate = parseFloat(totals[3]?.value ?? "0") * 100
            ga4Data.avgDuration = parseFloat(totals[4]?.value ?? "0")
          }

          // Semaine précédente pour le delta
          const prevWeek = await fetchGA4Report(
            accessToken, propertyId, "14daysAgo", "8daysAgo",
            ["sessions"]
          )
          const prevSessions = parseInt(prevWeek.totals?.[0]?.metricValues?.[0]?.value ?? "0")
          if (prevSessions > 0) {
            ga4Data.sessionsChange = Math.round(((ga4Data.sessions - prevSessions) / prevSessions) * 100)
          }
        }
      } catch (err) {
        logger.warn({ accountId: account.id, err }, "Erreur récupération GA4")
      }

      // Récupérer les top requêtes GSC
      let topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }> = []
      if (siteDomain) {
        try {
          const hasGscScope = ((account.scopes as string[]) ?? []).includes("https://www.googleapis.com/auth/webmasters.readonly")
          if (hasGscScope) {
            const endDate = new Date().toISOString().split("T")[0]!
            const startDate = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split("T")[0]!
            const siteUrl = siteDomain.startsWith("http") ? siteDomain : `https://${siteDomain}`
            topQueries = await fetchGSCQueries(accessToken, siteUrl, startDate, endDate)
          }
        } catch (err) {
          logger.warn({ accountId: account.id, err }, "Erreur récupération GSC")
        }
      }

      // Skip si aucune donnée
      if (ga4Data.sessions === 0 && topQueries.length === 0) {
        logger.info({ accountId: account.id }, "Aucune donnée GA/GSC, skip")
        continue
      }

      // Envoyer l'email à chaque utilisateur du tenant
      const apiKey = RESEND_API_KEY()
      if (!apiKey) continue

      for (const user of account.tenant.users) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: FROM_EMAIL(),
              to: user.email,
              subject: `Rapport hebdo — ${siteName} — ${ga4Data.sessions.toLocaleString("fr-FR")} sessions`,
              html: buildDigestHtml(siteName, ga4Data, topQueries),
            }),
          })

          if (!res.ok) {
            const errText = await res.text()
            logger.warn({ email: user.email, status: res.status, errText }, "Erreur envoi digest")
          } else {
            logger.info({ email: user.email, siteName }, "Digest hebdo envoyé")
          }
        } catch (err) {
          logger.warn({ email: user.email, err }, "Erreur envoi digest email")
        }
      }
    } catch (err) {
      logger.error({ accountId: account.id, err }, "Erreur digest pour ce compte")
    }
  }

  logger.info("Digests hebdo terminés")
}

function buildDigestHtml(
  siteName: string,
  ga4: { sessions: number; users: number; pageviews: number; bounceRate: number; avgDuration: number; sessionsChange?: number },
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>
): string {
  const changeHtml = ga4.sessionsChange !== undefined
    ? `<div style="color: ${ga4.sessionsChange >= 0 ? "#22c55e" : "#ef4444"}; font-size: 14px; font-weight: 600; margin-top: 4px;">
        ${ga4.sessionsChange >= 0 ? "+" : ""}${ga4.sessionsChange}% vs sem. préc.
      </div>`
    : ""

  const gscHtml = topQueries.length > 0 ? `
    <h3 style="color: #f1f5f9; font-size: 16px; margin-top: 32px; margin-bottom: 12px;">Top requêtes Search Console</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #1e293b;">
        <th style="text-align: left; padding: 8px 4px; color: #64748b; font-size: 12px;">Requête</th>
        <th style="text-align: right; padding: 8px 4px; color: #64748b; font-size: 12px;">Clics</th>
        <th style="text-align: right; padding: 8px 4px; color: #64748b; font-size: 12px;">Pos.</th>
      </tr>
      ${topQueries.map(q => `
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 8px 4px; color: #f1f5f9; font-size: 13px;">${q.query}</td>
          <td style="text-align: right; padding: 8px 4px; color: #06b6d4; font-size: 13px; font-weight: 600;">${q.clicks}</td>
          <td style="text-align: right; padding: 8px 4px; color: #94a3b8; font-size: 13px;">${q.position.toFixed(1)}</td>
        </tr>
      `).join("")}
    </table>
  ` : ""

  const appUrl = APP_URL()

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #0f172a; color: #f1f5f9;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #2563eb; font-size: 24px; margin: 0;">404 SEO</h1>
      </div>

      <h2 style="color: #f1f5f9; font-size: 20px;">Rapport hebdomadaire</h2>
      <p style="color: #94a3b8;">7 derniers jours pour <strong style="color: #f1f5f9;">${siteName}</strong></p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="background: #1e293b; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Sessions</div>
            <div style="color: #2563eb; font-size: 24px; font-weight: bold;">${ga4.sessions.toLocaleString("fr-FR")}</div>
            ${changeHtml}
          </td>
          <td style="width: 12px;"></td>
          <td style="background: #1e293b; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Utilisateurs</div>
            <div style="color: #06b6d4; font-size: 24px; font-weight: bold;">${ga4.users.toLocaleString("fr-FR")}</div>
          </td>
          <td style="width: 12px;"></td>
          <td style="background: #1e293b; border-radius: 12px; padding: 16px; text-align: center; width: 33%;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Pages vues</div>
            <div style="color: #8b5cf6; font-size: 24px; font-weight: bold;">${ga4.pageviews.toLocaleString("fr-FR")}</div>
          </td>
        </tr>
      </table>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="background: #1e293b; border-radius: 12px; padding: 16px; text-align: center; width: 50%;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Taux de rebond</div>
            <div style="color: #f59e0b; font-size: 24px; font-weight: bold;">${ga4.bounceRate.toFixed(1)}%</div>
          </td>
          <td style="width: 12px;"></td>
          <td style="background: #1e293b; border-radius: 12px; padding: 16px; text-align: center; width: 50%;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">Durée moyenne</div>
            <div style="color: #10b981; font-size: 24px; font-weight: bold;">${Math.floor(ga4.avgDuration / 60)}m${Math.round(ga4.avgDuration % 60)}s</div>
          </td>
        </tr>
      </table>

      ${gscHtml}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/dashboard" style="display: inline-block; padding: 12px 32px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Voir le dashboard</a>
      </div>

      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
        <p>404 SEO — Audit SEO professionnel</p>
        <p><a href="${appUrl}" style="color: #2563eb;">seo.404notfood.fr</a></p>
      </div>
    </div>
  `
}

// Vérifier toutes les 5 minutes
const INTERVAL = 5 * 60 * 1000

async function start() {
  logger.info("Schedule worker démarré (intervalle: 5min)")

  // Check immédiat au démarrage
  await checkScheduledAudits()

  // Puis toutes les 5 minutes
  setInterval(async () => {
    try {
      await checkScheduledAudits()
      // Vérifier aussi les digests hebdo GA
      await sendWeeklyGADigests()
    } catch (err) {
      logger.error({ err }, "Erreur dans le schedule worker")
    }
  }, INTERVAL)
}

start().catch((err) => {
  logger.error(err)
  process.exit(1)
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM reçu, arrêt du schedule worker...")
  await crawlQueue.close()
  await prisma.$disconnect()
  process.exit(0)
})
