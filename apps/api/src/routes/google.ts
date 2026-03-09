// routes/google.ts — OAuth Google unifié (GBP + GA4 + GSC)
import type { FastifyPluginAsync } from "fastify"
import { randomUUID } from "crypto"
import { google, Auth } from "googleapis"
import { prisma } from "../lib/prisma.js"
import { redis } from "../lib/redis.js"
import { getOAuthClient, getAuthenticatedClient, GOOGLE_SCOPES } from "../lib/googleOAuth.js"

const STATE_TTL = 600 // 10 minutes

const googleRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── GET /api/google/auth — Initier OAuth (AUTH REQUIS) ───────────────────
  fastify.get("/api/google/auth", async (request, reply) => {
    const state = randomUUID()
    await redis.set(
      `google_oauth_state:${state}`,
      JSON.stringify({ tenantId: request.tenantId, userId: request.userId }),
      "EX",
      STATE_TTL
    )

    const auth = getOAuthClient()
    const authUrl = auth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_SCOPES,
      state,
    })

    return reply.redirect(authUrl)
  })

  // ─── GET /api/google/callback — Callback Google (PUBLIC) ──────────────────
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/api/google/callback",
    async (request, reply) => {
      const { code, state, error } = request.query
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000"

      if (error || !code || !state) {
        return reply.redirect(`${appUrl}/settings?google=error`)
      }

      // Valider le state dans Redis (usage unique)
      const stateKey = `google_oauth_state:${state}`
      const stateData = await redis.get(stateKey)
      if (!stateData) {
        return reply.redirect(`${appUrl}/settings?google=error`)
      }
      await redis.del(stateKey)

      let tenantId: string
      try {
        const parsed = JSON.parse(stateData) as { tenantId: string; userId: string }
        tenantId = parsed.tenantId
      } catch {
        return reply.redirect(`${appUrl}/settings?google=error`)
      }

      // Échanger le code contre les tokens
      const auth = getOAuthClient()
      let tokens: {
        access_token?: string | null
        refresh_token?: string | null
        expiry_date?: number | null
      }
      try {
        const { tokens: t } = await auth.getToken(code)
        tokens = t
      } catch {
        return reply.redirect(`${appUrl}/settings?google=error`)
      }

      if (!tokens.access_token || !tokens.refresh_token) {
        return reply.redirect(`${appUrl}/settings?google=error`)
      }

      auth.setCredentials(tokens)

      // Récupérer l'email et le sub Google
      const oauth2 = google.oauth2({ version: "v2", auth })
      let googleEmail = ""
      let googleId = ""
      try {
        const userInfo = await oauth2.userinfo.get()
        googleEmail = userInfo.data.email ?? ""
        googleId = userInfo.data.id ?? ""
      } catch {
        // Non bloquant
      }

      // Sauvegarder en DB
      await prisma.googleAccount.upsert({
        where: { tenantId },
        create: {
          tenantId,
          googleEmail,
          googleId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
          scopes: GOOGLE_SCOPES,
        },
        update: {
          googleEmail,
          googleId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
          scopes: GOOGLE_SCOPES,
        },
      })

      // Importer les fiches GBP automatiquement
      try {
        await importGBPListings(tenantId, auth)
      } catch (err) {
        fastify.log.warn({ err }, "Impossible d'importer les fiches GBP")
      }

      return reply.redirect(`${appUrl}/settings?google=connected`)
    }
  )

  // ─── GET /api/google/status — Statut connexion (AUTH REQUIS) ─────────────
  fastify.get("/api/google/status", async (request, reply) => {
    const account = await prisma.googleAccount.findUnique({
      where: { tenantId: request.tenantId },
      select: {
        googleEmail: true,
        scopes: true,
        connectedAt: true,
      },
    })

    if (!account) {
      return reply.send({ connected: false, email: null, scopes: [], connectedAt: null })
    }

    return reply.send({
      connected: true,
      email: account.googleEmail,
      scopes: account.scopes,
      connectedAt: account.connectedAt,
    })
  })

  // ─── POST /api/google/disconnect — Déconnecter (AUTH REQUIS) ─────────────
  fastify.post("/api/google/disconnect", async (request, reply) => {
    const account = await prisma.googleAccount.findUnique({
      where: { tenantId: request.tenantId },
    })

    if (account) {
      // Révoquer le token Google
      try {
        const auth = getOAuthClient()
        auth.setCredentials({ access_token: account.accessToken })
        await auth.revokeCredentials()
      } catch {
        // Non bloquant si révocation échoue
      }

      // Supprimer le compte Google
      await prisma.googleAccount.delete({ where: { tenantId: request.tenantId } })

      // Marquer les fiches GBP comme déconnectées
      await prisma.gBPListing.updateMany({
        where: { tenantId: request.tenantId },
        data: { isGoogleConnected: false },
      })
    }

    return reply.send({ success: true })
  })

  // ─── GET /api/google/analytics — Données GA4 (AUTH REQUIS) ───────────────
  fastify.get<{ Querystring: { propertyId?: string } }>(
    "/api/google/analytics",
    async (request, reply) => {
      let auth: Auth.OAuth2Client
      try {
        auth = await getAuthenticatedClient(request.tenantId)
      } catch {
        return reply.status(400).send({ error: "Compte Google non connecté" })
      }

      const analyticsData = google.analyticsdata({ version: "v1beta", auth })
      const { propertyId } = request.query

      if (!propertyId) {
        return reply.status(400).send({ error: "propertyId requis (ex: properties/123456789)" })
      }

      try {
        const response = await analyticsData.properties.runReport({
          property: propertyId,
          requestBody: {
            dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
            metrics: [
              { name: "sessions" },
              { name: "totalUsers" },
              { name: "screenPageViews" },
              { name: "bounceRate" },
              { name: "averageSessionDuration" },
            ],
            dimensions: [{ name: "date" }],
            orderBys: [{ dimension: { dimensionName: "date" } }],
          },
        })

        const rows = response.data.rows ?? []
        let totalSessions = 0
        let totalUsers = 0
        let totalPageviews = 0

        const timeline = rows.map((row) => {
          const s = parseInt(row.metricValues?.[0]?.value ?? "0")
          const u = parseInt(row.metricValues?.[1]?.value ?? "0")
          const p = parseInt(row.metricValues?.[2]?.value ?? "0")
          totalSessions += s
          totalUsers += u
          totalPageviews += p
          return {
            date: row.dimensionValues?.[0]?.value ?? "",
            sessions: s,
            users: u,
            pageviews: p,
          }
        })

        const totals = response.data.totals?.[0]
        const bounceRate = parseFloat(totals?.metricValues?.[3]?.value ?? "0")
        const avgDuration = parseFloat(totals?.metricValues?.[4]?.value ?? "0")

        return reply.send({
          sessions: totalSessions,
          users: totalUsers,
          pageviews: totalPageviews,
          bounceRate: Math.round(bounceRate * 100) / 100,
          avgSessionDuration: Math.round(avgDuration),
          timeline,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur GA4"
        return reply.status(500).send({ error: msg })
      }
    }
  )

  // ─── GET /api/google/search-console — Données GSC (AUTH REQUIS) ──────────
  fastify.get<{ Querystring: { siteUrl?: string } }>(
    "/api/google/search-console",
    async (request, reply) => {
      let auth: Auth.OAuth2Client
      try {
        auth = await getAuthenticatedClient(request.tenantId)
      } catch {
        return reply.status(400).send({ error: "Compte Google non connecté" })
      }

      const searchConsole = google.searchconsole({ version: "v1", auth })
      const { siteUrl } = request.query

      if (!siteUrl) {
        return reply.status(400).send({ error: "siteUrl requis (ex: https://monsite.com/)" })
      }

      try {
        const endDate = new Date().toISOString().split("T")[0]!
        const startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split("T")[0]!

        const response = await searchConsole.searchanalytics.query({
          siteUrl,
          requestBody: {
            startDate,
            endDate,
            dimensions: ["query"],
            rowLimit: 50,
          },
        })

        const rows = response.data.rows ?? []
        let totalClicks = 0
        let totalImpressions = 0
        let totalPosition = 0

        const queries = rows.map((row) => {
          totalClicks += row.clicks ?? 0
          totalImpressions += row.impressions ?? 0
          totalPosition += row.position ?? 0
          return {
            query: row.keys?.[0] ?? "",
            clicks: row.clicks ?? 0,
            impressions: row.impressions ?? 0,
            ctr: Math.round((row.ctr ?? 0) * 10000) / 100,
            position: Math.round((row.position ?? 0) * 10) / 10,
          }
        })

        return reply.send({
          queries,
          totals: {
            clicks: totalClicks,
            impressions: totalImpressions,
            avgPosition: rows.length > 0 ? Math.round((totalPosition / rows.length) * 10) / 10 : 0,
          },
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erreur GSC"
        return reply.status(500).send({ error: msg })
      }
    }
  )
}

// ─── Helper : importer les fiches GBP depuis Google ──────────────────────────
async function importGBPListings(tenantId: string, auth: Auth.OAuth2Client) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountsClient = google.mybusinessaccountmanagement({ version: "v1", auth: auth as any })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mybusiness = google.mybusinessbusinessinformation({ version: "v1", auth: auth as any })

  // Récupérer les comptes GBP
  const accountsRes = await accountsClient.accounts.list({})
  const accounts = accountsRes.data.accounts ?? []

  for (const account of accounts) {
    if (!account.name) continue

    // Récupérer les fiches de chaque compte
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locationsRes = await (mybusiness.accounts as any).locations.list({
      parent: account.name,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locations: any[] = locationsRes.data?.locations ?? []

    for (const location of locations) {
      const googlePlaceId = location.name as string | undefined
      const googleLocationName = location.title as string | undefined
      const address = (location.storefrontAddress?.addressLines as string[] | undefined)?.join(", ") ?? ""
      const phone = (location.phoneNumbers?.primaryPhone as string | undefined) ?? null
      const website = (location.websiteUri as string | undefined) ?? null
      const category = (location.primaryCategory?.displayName as string | undefined) ?? "Non catégorisé"

      if (!googlePlaceId) continue

      // Chercher une fiche existante pour éviter les doublons
      const existing = await prisma.gBPListing.findFirst({
        where: { tenantId, googlePlaceId },
        select: { id: true },
      })

      if (existing) {
        await prisma.gBPListing.update({
          where: { id: existing.id },
          data: {
            googlePlaceId,
            googleLocationName,
            isGoogleConnected: true,
            ...(phone ? { phone } : {}),
            ...(website ? { website } : {}),
          },
        })
      } else {
        await prisma.gBPListing.create({
          data: {
            tenantId,
            businessName: googleLocationName ?? "Établissement Google",
            category,
            address: address || "Adresse non renseignée",
            phone,
            website,
            googlePlaceId,
            googleLocationName,
            isGoogleConnected: true,
            completionScore: 0,
            isVerified: false,
            status: "ACTIVE",
          },
        })
      }
    }
  }
}

export default googleRoutes
