// Plugin d'authentification — vérifie le JWT BetterAuth
import type { FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import type { Prisma } from "@prisma/client"
import { prisma } from "../lib/prisma"

declare module "fastify" {
  interface FastifyRequest {
    userId: string
    tenantId: string
    role: "ADMIN" | "MEMBER" | "GUEST"
    isSuperAdmin: boolean
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("userId", "")
  fastify.decorateRequest("tenantId", "")
  fastify.decorateRequest("role", "MEMBER")
  fastify.decorateRequest("isSuperAdmin", false)

  fastify.addHook("preHandler", async (request: FastifyRequest, reply) => {
    // Routes publiques
    const publicPaths = ["/health", "/api/auth", "/api/billing/webhook", "/api/google/callback", "/api/reports/"]
    if (publicPaths.some((p) => request.url.startsWith(p))) return

    const authHeader = request.headers.authorization
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

    // Aussi vérifier le cookie de session BetterAuth (préfixe __Secure- en HTTPS)
    const cookieToken = (
      request.cookies?.["__Secure-better-auth.session_token"] ||
      request.cookies?.["better-auth.session_token"]
    )?.split(".")[0]
    const sessionToken = token || cookieToken

    if (!sessionToken) {
      return reply.status(401).send({ error: "Non authentifié" })
    }

    // Vérifier le token de session BetterAuth dans la DB
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: "Session expirée ou invalide" })
    }

    // Charger l'utilisateur séparément pour rester robuste même si la relation Prisma Session->User
    // n'est pas typée dans le client généré courant.
    const userSelect = {
      id: true,
      tenantId: true,
      role: true,
      email: true,
      name: true,
      isBanned: true,
      isSuperAdmin: true,
    } satisfies Prisma.UserSelect

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: userSelect,
    })

    if (!user) {
      return reply.status(401).send({ error: "Session invalide (utilisateur introuvable)" })
    }

    request.userId = user.id
    request.role = (user.role as "ADMIN" | "MEMBER" | "GUEST") || "MEMBER"
    request.isSuperAdmin = user.isSuperAdmin === true

    // Filet de sécurité : si l'utilisateur n'a toujours pas de tenant (le hook BetterAuth l'a déjà créé normalement)
    if (!user.tenantId) {
      // Vérifier d'abord si un tenant existe déjà pour cet utilisateur (race condition)
      const existingUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { tenantId: true },
      })

      if (existingUser?.tenantId) {
        request.tenantId = existingUser.tenantId
      } else {
        const slug = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-")
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`

        const tenant = await prisma.tenant.create({
          data: {
            name: user.name || user.email.split("@")[0],
            slug: uniqueSlug,
            plan: "STARTER",
          },
        })

        await prisma.user.update({
          where: { id: user.id },
          data: { tenantId: tenant.id, role: "GUEST" },
        })

        request.tenantId = tenant.id
        request.role = "GUEST"
      }
    } else {
      request.tenantId = user.tenantId
    }

    // Bloquer les comptes suspendus
    const tenant = await prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: { isSuspended: true },
    })
    if (tenant?.isSuspended) {
      return reply.status(403).send({
        error: "Compte suspendu",
        message: "Votre compte a été suspendu. Contactez le support.",
      })
    }

    // Bloquer les utilisateurs bannis
    if (user.isBanned) {
      return reply.status(403).send({
        error: "Compte banni",
        message: "Votre compte a été banni.",
      })
    }
  })
}

export default fp(authPlugin)
