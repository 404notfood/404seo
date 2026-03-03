import type { FastifyPluginAsync } from "fastify"
import { prisma } from "../lib/prisma"

const meRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/me — Infos utilisateur connecté
  fastify.get("/api/me", async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
          },
        },
      },
    })

    if (!user) {
      return reply.status(404).send({ error: "Utilisateur introuvable" })
    }

    return reply.send(user)
  })
}

export default meRoutes
