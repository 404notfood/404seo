import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { requireRole, requireFeature } from "../lib/guards"

const CreateListingSchema = z.object({
  businessName: z.string().min(1),
  category: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

const localRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/local/dashboard — Dashboard SEO Local
  fastify.get("/api/local/dashboard", async (request, reply) => {
    const listings = await prisma.gBPListing.findMany({
      where: { tenantId: request.tenantId },
      include: {
        _count: { select: { reviews: true, posts: true, rankings: true, photos: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    if (listings.length === 0) {
      return reply.send({
        listings: [],
        avgRating: 0,
        totalReviews: 0,
        pendingReplies: 0,
        postsThisMonth: 0,
      })
    }

    const listingIds = listings.map((l) => l.id)

    const [reviews, pendingReplies, postsThisMonth] = await Promise.all([
      prisma.gBPReview.findMany({
        where: { listingId: { in: listingIds } },
        select: { rating: true },
      }),
      prisma.gBPReview.count({
        where: { listingId: { in: listingIds }, replyStatus: "PENDING" },
      }),
      prisma.gBPPost.count({
        where: {
          listingId: { in: listingIds },
          status: "PUBLISHED",
          publishedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ])

    const totalReviews = reviews.length
    const avgRating = totalReviews > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / totalReviews) * 10) / 10
      : 0

    return reply.send({
      listings,
      avgRating,
      totalReviews,
      pendingReplies,
      postsThisMonth,
    })
  })

  // POST /api/local/listings — Créer une fiche
  fastify.post("/api/local/listings", { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] }, async (request, reply) => {
    const parse = CreateListingSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: "Données invalides", details: parse.error.flatten() })
    }
    const { businessName, category, address, phone, website, lat, lng } = parse.data

    const listing = await prisma.gBPListing.create({
      data: {
        tenantId: request.tenantId,
        businessName,
        category,
        address,
        phone: phone ?? null,
        website: website ?? null,
        lat: lat ?? null,
        lng: lng ?? null,
        completionScore: 0,
        isVerified: false,
        status: "ACTIVE",
      },
      include: {
        _count: { select: { reviews: true, posts: true, rankings: true, photos: true } },
      },
    })
    return reply.status(201).send(listing)
  })

  // GET /api/local/listings — Liste des fiches
  fastify.get("/api/local/listings", async (request, reply) => {
    const listings = await prisma.gBPListing.findMany({
      where: { tenantId: request.tenantId },
      include: {
        _count: { select: { reviews: true, posts: true, rankings: true, photos: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(listings)
  })

  // GET /api/local/listings/:id/reviews — Avis d'une fiche
  fastify.get<{ Params: { id: string } }>("/api/local/listings/:id/reviews", async (request, reply) => {
    const listing = await prisma.gBPListing.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
    })
    if (!listing) return reply.status(404).send({ error: "Fiche introuvable" })

    const reviews = await prisma.gBPReview.findMany({
      where: { listingId: listing.id },
      orderBy: { publishedAt: "desc" },
    })

    const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
    let totalRating = 0
    for (const r of reviews) {
      distribution[String(r.rating)] = (distribution[String(r.rating)] ?? 0) + 1
      totalRating += r.rating
    }

    return reply.send({
      reviews,
      stats: {
        avgRating: reviews.length > 0 ? Math.round((totalRating / reviews.length) * 10) / 10 : 0,
        total: reviews.length,
        distribution,
      },
    })
  })

  // GET /api/local/listings/:id/posts — Posts Google d'une fiche
  fastify.get<{ Params: { id: string } }>("/api/local/listings/:id/posts", async (request, reply) => {
    const listing = await prisma.gBPListing.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
    })
    if (!listing) return reply.status(404).send({ error: "Fiche introuvable" })

    const posts = await prisma.gBPPost.findMany({
      where: { listingId: listing.id },
      orderBy: { createdAt: "desc" },
    })

    return reply.send({ posts, total: posts.length })
  })

  // POST /api/local/listings/:id/reviews/:reviewId/reply — Répondre à un avis
  fastify.post<{ Params: { id: string; reviewId: string } }>(
    "/api/local/listings/:id/reviews/:reviewId/reply",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const body = request.body as { replyText: string }
      if (!body.replyText?.trim()) return reply.status(400).send({ error: "Réponse requise" })

      const listing = await prisma.gBPListing.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
      })
      if (!listing) return reply.status(404).send({ error: "Fiche introuvable" })

      const review = await prisma.gBPReview.findFirst({
        where: { id: request.params.reviewId, listingId: listing.id },
      })
      if (!review) return reply.status(404).send({ error: "Avis introuvable" })

      const updated = await prisma.gBPReview.update({
        where: { id: review.id },
        data: { replyText: body.replyText.trim(), replyStatus: "REPLIED" },
      })
      return reply.send(updated)
    }
  )

  // POST /api/local/listings/:id/reviews/:reviewId/ai-suggest — Suggestion IA pour répondre
  fastify.post<{ Params: { id: string; reviewId: string } }>(
    "/api/local/listings/:id/reviews/:reviewId/ai-suggest",
    async (request, reply) => {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return reply.status(400).send({ error: "ANTHROPIC_API_KEY non configurée" })

      const listing = await prisma.gBPListing.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
        select: { businessName: true, category: true },
      })
      if (!listing) return reply.status(404).send({ error: "Fiche introuvable" })

      const review = await prisma.gBPReview.findFirst({
        where: { id: request.params.reviewId, listingId: request.params.id },
        select: { id: true, rating: true, text: true, authorName: true },
      })
      if (!review) return reply.status(404).send({ error: "Avis introuvable" })

      const prompt = `Tu es le gérant de l'établissement "${listing.businessName}" (${listing.category}).
Un client "${review.authorName}" a laissé un avis ${review.rating}/5 étoiles :
"${review.text || "(pas de texte)"}"

Rédige une réponse professionnelle, chaleureuse et personnalisée en français (3-4 phrases max).
Commence directement par la réponse, sans introduction ni meta-commentaire.`

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      })

      const data = await response.json() as { content: Array<{ type: string; text?: string }> }
      const suggestion = data.content.find((c) => c.type === "text")?.text ?? ""

      // Sauvegarder la suggestion
      await prisma.gBPReview.update({
        where: { id: review.id },
        data: { aiSuggestedReply: suggestion },
      })

      return reply.send({ suggestion })
    }
  )

  // POST /api/local/listings/:id/posts — Créer un post Google
  fastify.post<{ Params: { id: string } }>(
    "/api/local/listings/:id/posts",
    { preHandler: [requireRole("MEMBER"), requireFeature("local_seo")] },
    async (request, reply) => {
      const body = request.body as {
        content: string
        type?: string
        ctaType?: string
        ctaUrl?: string
        scheduledAt?: string
      }
      if (!body.content?.trim()) return reply.status(400).send({ error: "Contenu requis" })

      const listing = await prisma.gBPListing.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
      })
      if (!listing) return reply.status(404).send({ error: "Fiche introuvable" })

      const isScheduled = !!body.scheduledAt
      const post = await prisma.gBPPost.create({
        data: {
          listingId: listing.id,
          content: body.content.trim(),
          type: (body.type as "UPDATE" | "EVENT" | "OFFER") ?? "UPDATE",
          status: isScheduled ? "SCHEDULED" : "PUBLISHED",
          ctaType: body.ctaType ?? null,
          ctaUrl: body.ctaUrl ?? null,
          scheduledAt: isScheduled ? new Date(body.scheduledAt!) : null,
          publishedAt: isScheduled ? null : new Date(),
          views: 0,
          clicks: 0,
        },
      })
      return reply.status(201).send(post)
    }
  )

  // GET /api/local/listings/:id/rankings — Rankings Maps
  fastify.get<{ Params: { id: string } }>("/api/local/listings/:id/rankings", async (request, reply) => {
    const listing = await prisma.gBPListing.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
    })
    if (!listing) return reply.status(404).send({ error: "Fiche introuvable" })

    const rankings = await prisma.gBPRanking.findMany({
      where: { listingId: listing.id },
      orderBy: { checkedAt: "desc" },
    })

    return reply.send({ rankings })
  })
}

export default localRoutes
