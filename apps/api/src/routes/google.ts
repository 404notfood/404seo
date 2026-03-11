// routes/google.ts — OAuth Google unifié (GBP + GA4 + GSC) + sync GBP
import type { FastifyPluginAsync } from "fastify"
import { randomUUID } from "crypto"
import { google, Auth } from "googleapis"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { redis } from "../lib/redis.js"
import { getOAuthClient, getAuthenticatedClient, GOOGLE_SCOPES, GOOGLE_ANALYTICS_SCOPES } from "../lib/googleOAuth.js"
import { requireRole, requireFeature } from "../lib/guards.js"
import {
  listAccounts,
  listLocations,
  listReviews,
  listLocalPosts,
  replyToReview as gbpReplyToReview,
  createLocalPost,
  deleteLocalPost,
  starRatingToNumber,
  detectSentiment,
} from "../lib/gbpApi.js"

const STATE_TTL = 600 // 10 minutes

const googleRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── GET /api/google/auth — Initier OAuth (AUTH REQUIS) ───────────────────
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
      const existingAccount = await prisma.googleAccount.findFirst({
        where: { tenantId, googleId },
      })

      let googleAccountId: string
      if (existingAccount) {
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

      const redirectTarget = flow === "analytics" ? `/settings?google=analytics-connected` : listingId ? `/local/gbp` : `/local/gbp`
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC GBP — Routes de synchronisation
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── POST /api/google/sync — Sync manuelle des fiches GBP ─────────────────
  fastify.post(
    "/api/google/sync",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const accounts = await prisma.googleAccount.findMany({
        where: { tenantId: request.tenantId },
      })

      if (accounts.length === 0) {
        return reply.status(400).send({ error: "Aucun compte Google connecté" })
      }

      let totalImported = 0
      const errors: string[] = []

      for (const account of accounts) {
        try {
          const auth = await getAuthenticatedClient(request.tenantId, account.id)
          const count = await importGBPListings(request.tenantId, account.id, auth)
          totalImported += count
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`${account.googleEmail}: ${msg}`)
          fastify.log.error({ err, accountId: account.id }, `Sync GBP failed`)
        }
      }

      return reply.send({ success: true, imported: totalImported, errors })
    }
  )

  // ─── POST /api/google/sync/reviews — Sync des avis depuis Google ──────────
  fastify.post<{ Querystring: { listingId?: string } }>(
    "/api/google/sync/reviews",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const { listingId } = request.query as { listingId?: string }

      // Récupérer les fiches connectées à Google
      const where: { tenantId: string; isGoogleConnected: boolean; id?: string } = {
        tenantId: request.tenantId,
        isGoogleConnected: true,
      }
      if (listingId) where.id = listingId

      const listings = await prisma.gBPListing.findMany({
        where,
        include: { googleAccount: true },
      })

      if (listings.length === 0) {
        return reply.status(400).send({ error: "Aucune fiche connectée à Google" })
      }

      let totalSynced = 0
      const errors: string[] = []

      for (const listing of listings) {
        if (!listing.googleAccount || !listing.googlePlaceId) continue

        try {
          const auth = await getAuthenticatedClient(request.tenantId, listing.googleAccount.id)

          // Trouver le nom du compte GBP pour cette fiche
          const accountName = await findAccountForLocation(auth, listing.googlePlaceId)
          if (!accountName) {
            errors.push(`${listing.businessName}: compte GBP introuvable`)
            continue
          }

          const reviews = await listReviews(auth, accountName, listing.googlePlaceId)

          for (const review of reviews) {
            const rating = starRatingToNumber(review.starRating)
            const sentiment = detectSentiment(rating, review.comment)

            // Upsert par googleReviewId pour éviter les doublons
            await prisma.gBPReview.upsert({
              where: { googleReviewId: review.name },
              create: {
                listingId: listing.id,
                googleReviewId: review.name,
                authorName: review.reviewer.displayName ?? "Anonyme",
                rating,
                text: review.comment ?? null,
                sentiment,
                replyText: review.reviewReply?.comment ?? null,
                replyStatus: review.reviewReply ? "REPLIED" : "PENDING",
                publishedAt: new Date(review.createTime),
              },
              update: {
                authorName: review.reviewer.displayName ?? "Anonyme",
                rating,
                text: review.comment ?? null,
                sentiment,
                replyText: review.reviewReply?.comment ?? null,
                replyStatus: review.reviewReply ? "REPLIED" : "PENDING",
              },
            })
            totalSynced++
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`${listing.businessName}: ${msg}`)
          fastify.log.error({ err, listingId: listing.id }, `Sync reviews failed`)
        }
      }

      return reply.send({ success: true, synced: totalSynced, errors })
    }
  )

  // ─── POST /api/google/sync/posts — Sync des posts depuis Google ───────────
  fastify.post<{ Querystring: { listingId?: string } }>(
    "/api/google/sync/posts",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const { listingId } = request.query as { listingId?: string }

      const where: { tenantId: string; isGoogleConnected: boolean; id?: string } = {
        tenantId: request.tenantId,
        isGoogleConnected: true,
      }
      if (listingId) where.id = listingId

      const listings = await prisma.gBPListing.findMany({
        where,
        include: { googleAccount: true },
      })

      if (listings.length === 0) {
        return reply.status(400).send({ error: "Aucune fiche connectée à Google" })
      }

      let totalSynced = 0
      const errors: string[] = []

      for (const listing of listings) {
        if (!listing.googleAccount || !listing.googlePlaceId) continue

        try {
          const auth = await getAuthenticatedClient(request.tenantId, listing.googleAccount.id)
          const accountName = await findAccountForLocation(auth, listing.googlePlaceId)
          if (!accountName) {
            errors.push(`${listing.businessName}: compte GBP introuvable`)
            continue
          }

          const posts = await listLocalPosts(auth, accountName, listing.googlePlaceId)

          for (const post of posts) {
            const topicType = post.topicType === "OFFER" ? "OFFER" : post.topicType === "EVENT" ? "EVENT" : "UPDATE"

            await prisma.gBPPost.upsert({
              where: { googlePostName: post.name },
              create: {
                listingId: listing.id,
                googlePostName: post.name,
                content: post.summary ?? "",
                type: topicType as "UPDATE" | "EVENT" | "OFFER",
                status: post.state === "LIVE" ? "PUBLISHED" : "DRAFT",
                ctaType: post.callToAction?.actionType ?? null,
                ctaUrl: post.callToAction?.url ?? null,
                imageUrl: post.media?.[0]?.googleUrl ?? null,
                publishedAt: new Date(post.createTime),
                views: 0,
                clicks: 0,
              },
              update: {
                content: post.summary ?? "",
                status: post.state === "LIVE" ? "PUBLISHED" : "DRAFT",
                ctaType: post.callToAction?.actionType ?? null,
                ctaUrl: post.callToAction?.url ?? null,
                imageUrl: post.media?.[0]?.googleUrl ?? null,
              },
            })
            totalSynced++
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push(`${listing.businessName}: ${msg}`)
          fastify.log.error({ err, listingId: listing.id }, `Sync posts failed`)
        }
      }

      return reply.send({ success: true, synced: totalSynced, errors })
    }
  )

  // ─── POST /api/google/listings/:id/publish-post — Publier un post vers Google ─
  fastify.post<{ Params: { id: string } }>(
    "/api/google/listings/:id/publish-post",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const body = z.object({
        content: z.string().min(1).max(1500),
        type: z.enum(["UPDATE", "EVENT", "OFFER"]).optional(),
        ctaType: z.string().optional(),
        ctaUrl: z.string().url().optional(),
        imageUrl: z.string().url().optional(),
      }).safeParse(request.body)

      if (!body.success) {
        return reply.status(400).send({ error: "Données invalides", details: body.error.flatten() })
      }

      const listing = await prisma.gBPListing.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId, isGoogleConnected: true },
        include: { googleAccount: true },
      })

      if (!listing || !listing.googleAccount || !listing.googlePlaceId) {
        return reply.status(400).send({ error: "Fiche non connectée à Google" })
      }

      const auth = await getAuthenticatedClient(request.tenantId, listing.googleAccount.id)
      const accountName = await findAccountForLocation(auth, listing.googlePlaceId)
      if (!accountName) {
        return reply.status(400).send({ error: "Compte GBP introuvable pour cette fiche" })
      }

      const googlePost = await createLocalPost(auth, accountName, listing.googlePlaceId, {
        summary: body.data.content,
        topicType: body.data.type === "OFFER" ? "OFFER" : body.data.type === "EVENT" ? "EVENT" : "STANDARD",
        ...(body.data.ctaType && body.data.ctaUrl ? {
          callToAction: { actionType: body.data.ctaType, url: body.data.ctaUrl },
        } : {}),
        ...(body.data.imageUrl ? {
          media: [{ mediaFormat: "PHOTO", sourceUrl: body.data.imageUrl }],
        } : {}),
      })

      // Sauvegarder en base
      const post = await prisma.gBPPost.create({
        data: {
          listingId: listing.id,
          googlePostName: googlePost.name,
          content: body.data.content,
          type: (body.data.type as "UPDATE" | "EVENT" | "OFFER") ?? "UPDATE",
          status: "PUBLISHED",
          ctaType: body.data.ctaType ?? null,
          ctaUrl: body.data.ctaUrl ?? null,
          imageUrl: body.data.imageUrl ?? null,
          publishedAt: new Date(),
          views: 0,
          clicks: 0,
        },
      })

      return reply.status(201).send(post)
    }
  )

  // ─── POST /api/google/listings/:id/reviews/:reviewId/reply — Répondre sur Google ─
  fastify.post<{ Params: { id: string; reviewId: string } }>(
    "/api/google/listings/:id/reviews/:reviewId/reply",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const body = z.object({
        replyText: z.string().min(1).max(4096),
      }).safeParse(request.body)

      if (!body.success) {
        return reply.status(400).send({ error: "Réponse requise" })
      }

      const listing = await prisma.gBPListing.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId, isGoogleConnected: true },
        include: { googleAccount: true },
      })

      if (!listing || !listing.googleAccount) {
        return reply.status(400).send({ error: "Fiche non connectée à Google" })
      }

      const review = await prisma.gBPReview.findFirst({
        where: { id: request.params.reviewId, listingId: listing.id },
      })

      if (!review) {
        return reply.status(404).send({ error: "Avis introuvable" })
      }

      // Si l'avis a un googleReviewId, publier la réponse sur Google
      if (review.googleReviewId) {
        const auth = await getAuthenticatedClient(request.tenantId, listing.googleAccount.id)
        await gbpReplyToReview(auth, review.googleReviewId, body.data.replyText)
      }

      // Mettre à jour en base
      const updated = await prisma.gBPReview.update({
        where: { id: review.id },
        data: {
          replyText: body.data.replyText,
          replyStatus: "REPLIED",
        },
      })

      return reply.send(updated)
    }
  )

  // ─── DELETE /api/google/listings/:id/posts/:postId — Supprimer un post sur Google ─
  fastify.delete<{ Params: { id: string; postId: string } }>(
    "/api/google/listings/:id/posts/:postId",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const listing = await prisma.gBPListing.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
        include: { googleAccount: true },
      })

      if (!listing) {
        return reply.status(404).send({ error: "Fiche introuvable" })
      }

      const post = await prisma.gBPPost.findFirst({
        where: { id: request.params.postId, listingId: listing.id },
      })

      if (!post) {
        return reply.status(404).send({ error: "Post introuvable" })
      }

      // Supprimer sur Google si connecté
      if (post.googlePostName && listing.googleAccount) {
        try {
          const auth = await getAuthenticatedClient(request.tenantId, listing.googleAccount.id)
          await deleteLocalPost(auth, post.googlePostName)
        } catch (err) {
          fastify.log.warn({ err, postId: post.id }, "Échec suppression post Google (supprimé localement)")
        }
      }

      await prisma.gBPPost.delete({ where: { id: post.id } })
      return reply.send({ success: true })
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // Analytics & Search Console
  // ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

// Cache en mémoire pour le mapping location → account (évite les appels API en boucle)
const locationAccountCache = new Map<string, { accountName: string; expiresAt: number }>()

async function findAccountForLocation(auth: Auth.OAuth2Client, locationId: string): Promise<string | null> {
  // Vérifier le cache (TTL 5 min)
  const cached = locationAccountCache.get(locationId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accountName
  }

  const accounts = await listAccounts(auth)
  for (const account of accounts) {
    if (!account.name) continue
    try {
      const locations = await listLocations(auth, account.name)
      for (const loc of locations) {
        if (loc.name === locationId) {
          locationAccountCache.set(locationId, { accountName: account.name, expiresAt: Date.now() + 5 * 60_000 })
          return account.name
        }
      }
    } catch {
      continue
    }
  }

  return null
}

async function importGBPListings(tenantId: string, googleAccountId: string, auth: Auth.OAuth2Client): Promise<number> {
  let totalImported = 0

  const accounts = await listAccounts(auth)

  if (accounts.length === 0) {
    console.warn("[GBP Import] Aucun compte GBP trouvé pour ce compte Google")
    return 0
  }

  for (const account of accounts) {
    if (!account.name) continue

    let locations: Awaited<ReturnType<typeof listLocations>>
    try {
      locations = await listLocations(auth, account.name)
    } catch (err) {
      console.warn(`[GBP Import] Erreur fiches pour ${account.name}:`, err instanceof Error ? err.message : err)
      continue
    }

    for (const location of locations) {
      const googlePlaceId = location.name
      const googleLocationName = location.title
      const address = location.storefrontAddress?.addressLines?.join(", ") ?? ""
      const phone = location.phoneNumbers?.primaryPhone ?? null
      const website = location.websiteUri ?? null
      const category = location.primaryCategory?.displayName ?? "Non catégorisé"

      if (!googlePlaceId) continue

      // Cache le mapping location → account
      locationAccountCache.set(googlePlaceId, { accountName: account.name, expiresAt: Date.now() + 5 * 60_000 })

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
            businessName: googleLocationName ?? undefined,
            address: address || undefined,
            category,
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
      totalImported++
    }
  }

  return totalImported
}

export default googleRoutes
