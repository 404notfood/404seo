// Plugin d'authentification — vérifie le JWT BetterAuth
import type { FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import { prisma } from "../lib/prisma"

declare module "fastify" {
  interface FastifyRequest {
    userId: string
    tenantId: string
    role: "ADMIN" | "MEMBER" | "GUEST"
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("userId", "")
  fastify.decorateRequest("tenantId", "")
  fastify.decorateRequest("role", "MEMBER")

  fastify.addHook("preHandler", async (request: FastifyRequest, reply) => {
    // Routes publiques
    const publicPaths = ["/health", "/api/auth", "/api/billing/webhook"]
    if (publicPaths.some((p) => request.url.startsWith(p))) return

    const authHeader = request.headers.authorization
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

    // Aussi vérifier le cookie de session BetterAuth
    const cookieToken = request.cookies?.["better-auth.session_token"]?.split(".")[0]
    const sessionToken = token || cookieToken

    if (!sessionToken) {
      return reply.status(401).send({ error: "Non authentifié" })
    }

    // Vérifier le token de session BetterAuth dans la DB
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: { select: { id: true, tenantId: true, role: true, email: true, name: true } } },
    })

    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: "Session expirée ou invalide" })
    }

    request.userId = session.user.id
    request.role = (session.user.role as "ADMIN" | "MEMBER" | "GUEST") || "MEMBER"

    // Si l'utilisateur n'a pas de tenant, en créer un automatiquement
    if (!session.user.tenantId) {
      const slug = session.user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-")
      const uniqueSlug = `${slug}-${Date.now().toString(36)}`

      const tenant = await prisma.tenant.create({
        data: {
          name: session.user.name || session.user.email.split("@")[0],
          slug: uniqueSlug,
          plan: "STARTER",
        },
      })

      await prisma.user.update({
        where: { id: session.user.id },
        data: { tenantId: tenant.id, role: "ADMIN" },
      })

      request.tenantId = tenant.id
      request.role = "ADMIN"
    } else {
      request.tenantId = session.user.tenantId
    }
  })
}

export default fp(authPlugin)
