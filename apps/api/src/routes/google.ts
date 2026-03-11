// routes/google.ts — OAuth Google unifié (GBP + GA4 + GSC)
import type { FastifyPluginAsync } from "fastify"
import { randomUUID } from "crypto"
import { google, Auth } from "googleapis"
import { prisma } from "../lib/prisma.js"
import { redis } from "../lib/redis.js"
import { getOAuthClient, getAuthenticatedClient, GOOGLE_SCOPES, GOOGLE_ANALYTICS_SCOPES } from "../lib/googleOAuth.js"

const STATE_TTL = 600 // 10 minutes

const googleRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── GET /api/google/auth — Initier OAuth (AUTH REQUIS) ───────────────────
  // ?listingId=xxx pour lier le compte à une fiche spécifique
  // ?label=xxx pour nommer le compte (ex: "Client Dupont")
  fastify.get<{ Querystring: { listingId?: string; label?: string } }>(
    "/api/google/auth",
    async (request, reply) => {
      const { listingId, label } = request.query
      const state = randomUUID()
      await redis.set(
        `google_oauth_state:${state}`,
        JSON.stringify({ tenantId: request.tenantId, userId: request.userId, listingId, label }),
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
    }
  )

  // ─── GET /api/google/auth/analytics — OAuth pour Analytics + Search Console ─
  fastify.get(
    "/api/google/auth/analytics",
    async (request, reply) => {
      const state = randomUUID()
      await redis.set(
        `google_oauth_state:${state}`,
        JSON.stringify({ tenantId: request.tenantId, userId: request.userId, flow: "analytics" }),
        "EX",
        STATE_TTL
      )

      const auth = getOAuthClient()
      const authUrl = auth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: GOOGLE_ANALYTICS_SCOPES,
        state,
      })

      return reply.redirect(authUrl)
    }
  )

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
      let listingId: string | undefined
      let label: string | undefined
      let flow: string | undefined
      try {
        const parsed = JSON.parse(stateData) as { tenantId: string; userId: string; listingId?: string; label?: string; flow?: string }
        tenantId = parsed.tenantId
        listingId = parsed.listingId
        label = parsed.label
        flow = parsed.flow
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

      // Déterminer les scopes utilisés selon le flow
      const scopesUsed = flow === "analytics" ? GOOGLE_ANALYTICS_SCOPES : GOOGLE_SCOPES

      // Créer ou mettre à jour le GoogleAccount pour ce tenant + cet email Google
      // (évite les doublons si on reconnecte le même compte)
      const existingAccount = await prisma.googleAccount.findFirst({
        where: { tenantId, googleId },
      })

      let googleAccountId: string
      if (existingAccount) {
        // Fusionner les scopes si le compte existe déjà (GBP + Analytics)
        const existingScopes = (existingAccount.scopes as string[] | null) ?? []
        const mergedScopes = [...new Set([...existingScopes, ...scopesUsed])]
        await prisma.googleAccount.update({
          where: { id: existingAccount.id },
          data: {
            googleEmail,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
            scopes: mergedScopes,
            ...(label ? { label } : {}),
          },
        })
        googleAccountId = existingAccount.id
      } else {
        const newAccount = await prisma.googleAccount.create({
          data: {
            tenantId,
            googleEmail,
            googleId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
            scopes: scopesUsed,
            label: label ?? googleEmail,
          },
        })
        googleAccountId = newAccount.id
      }

      // Si une fiche spécifique est ciblée, la lier à ce compte
      if (listingId) {
        await prisma.gBPListing.update({
          where: { id: listingId, tenantId },
          data: { googleAccountId, isGoogleConnected: true },
        })
      }

      // Importer/synchroniser les fiches GBP depuis Google (sauf pour le flow analytics)
      if (flow !== "analytics") {
        try {
          await importGBPListings(tenantId, googleAccountId, auth)
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          fastify.log.error({ err, tenantId, googleAccountId }, `Échec import GBP: ${errMsg}`)
        }
      }

      const redirectTarget = flow === "analytics" ? `/settings?google=analytics-connected` : listingId ? `/local/gbp` : `/settings`
      return reply.redirect(`${appUrl}${redirectTarget}?google=connected`)
    }
  )

  // ─── GET /api/google/status — Liste des comptes connectés (AUTH REQUIS) ───
  fastify.get("/api/google/status", async (request, reply) => {
    const accounts = await prisma.googleAccount.findMany({
      where: { tenantId: request.tenantId },
      select: {
        id: true,
        googleEmail: true,
        label: true,
        scopes: true,
        connectedAt: true,
        listings: { select: { id: true, businessName: true } },
      },
      orderBy: { connectedAt: "desc" },
    })

    if (accounts.length === 0) {
      return reply.send({ connected: false, accounts: [] })
    }

    return reply.send({
      connected: true,
      // Compat rétro : email du premier compte
      email: accounts[0]?.googleEmail ?? null,
      accounts,
    })
  })

  // ─── POST /api/google/disconnect/:accountId — Déconnecter un compte ───────
  fastify.post<{ Params: { accountId: string } }>(
    "/api/google/disconnect/:accountId",
    async (request, reply) => {
      const account = await prisma.googleAccount.findFirst({
        where: { id: request.params.accountId, tenantId: request.tenantId },
      })

      if (account) {
        try {
          const auth = getOAuthClient()
          auth.setCredentials({ access_token: account.accessToken })
          await auth.revokeCredentials()
        } catch { /* Non bloquant */ }

        await prisma.googleAccount.delete({ where: { id: account.id } })
        // Les listings liées passent à isGoogleConnected: false via ON DELETE SET NULL + trigger ci-dessous
        await prisma.gBPListing.updateMany({
          where: { googleAccountId: account.id },
          data: { isGoogleConnected: false },
        })
      }

      return reply.send({ success: true })
    }
  )

  // ─── POST /api/google/disconnect — Déconnecter TOUS les comptes (compat) ──
  fastify.post("/api/google/disconnect", async (request, reply) => {
    const accounts = await prisma.googleAccount.findMany({
      where: { tenantId: request.tenantId },
    })

    for (const account of accounts) {
      try {
        const auth = getOAuthClient()
        auth.setCredentials({ access_token: account.accessToken })
        await auth.revokeCredentials()
      } catch { /* Non bloquant */ }
    }

    await prisma.googleAccount.deleteMany({ where: { tenantId: request.tenantId } })
    await prisma.gBPListing.updateMany({
      where: { tenantId: request.tenantId },
      data: { isGoogleConnected: false, googleAccountId: null },
    })

    return reply.send({ success: true })
  })

  // ─── POST /api/google/listing/:listingId/disconnect — Délier une fiche ────
  fastify.post<{ Params: { listingId: string } }>(
    "/api/google/listing/:listingId/disconnect",
    async (request, reply) => {
      await prisma.gBPListing.updateMany({
        where: { id: request.params.listingId, tenantId: request.tenantId },
        data: { isGoogleConnected: false, googleAccountId: null },
      })
      return reply.send({ success: true })
    }
  )

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
async function importGBPListings(tenantId: string, googleAccountId: string, auth: Auth.OAuth2Client) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountsClient = google.mybusinessaccountmanagement({ version: "v1", auth: auth as any })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mybusiness = google.mybusinessbusinessinformation({ version: "v1", auth: auth as any })

  // Récupérer les comptes GBP (avec pagination)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allAccounts: any[] = []
  let pageToken: string | undefined
  do {
    const accountsRes = await accountsClient.accounts.list({
      pageSize: 20,
      ...(pageToken ? { pageToken } : {}),
    })
    const accounts = accountsRes.data.accounts ?? []
    allAccounts = allAccounts.concat(accounts)
    pageToken = accountsRes.data.nextPageToken ?? undefined
  } while (pageToken)

  if (allAccounts.length === 0) {
    console.warn("[GBP Import] Aucun compte GBP trouvé pour ce compte Google")
    return
  }

  for (const account of allAccounts) {
    if (!account.name) continue

    // Récupérer les fiches de chaque compte (avec pagination + gestion d'erreur par compte)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allLocations: any[] = []
    let locPageToken: string | undefined
    try {
      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const locationsRes = await (mybusiness.accounts as any).locations.list({
          parent: account.name,
          pageSize: 100,
          readMask: "name,title,storefrontAddress,phoneNumbers,websiteUri,primaryCategory",
          ...(locPageToken ? { pageToken: locPageToken } : {}),
        })
        const locations = locationsRes.data?.locations ?? []
        allLocations = allLocations.concat(locations)
        locPageToken = locationsRes.data?.nextPageToken ?? undefined
      } while (locPageToken)
    } catch (err) {
      // Continuer avec les autres comptes si un échoue (ex: permissions insuffisantes)
      console.warn(`[GBP Import] Erreur lors de la récupération des fiches pour ${account.name}:`, err instanceof Error ? err.message : err)
      continue
    }

    for (const location of allLocations) {
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
            googleAccountId,
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
            googleAccountId,
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
