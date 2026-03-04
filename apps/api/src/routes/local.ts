import type { FastifyPluginAsync } from "fastify"
import { prisma } from "../lib/prisma"

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
