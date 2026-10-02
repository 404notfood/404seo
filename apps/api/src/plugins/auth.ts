// Plugin d'authentification — vérifie la session BetterAuth en base.
import { createHmac, timingSafeEqual } from "node:crypto"
import type { FastifyPluginAsync, FastifyRequest } from "fastify"
import fp from "fastify-plugin"
import type { Prisma } from "@prisma/client"
import { prisma } from "../lib/prisma"
import { isCrossSiteMutation, isPublicApiRoute } from "../lib/securityPolicy"

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
    if (isPublicApiRoute(request.method, request.url)) return

    const authHeader = request.headers.authorization
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
    if (isCrossSiteMutation(request.method, request.headers.origin, request.headers["sec-fetch-site"] as string | undefined, !!token)) {
      return reply.status(403).send({ error: "Origine de requête non autorisée" })
    }

    // Aussi vérifier le cookie de session BetterAuth (préfixe __Secure- en HTTPS)
    const signedCookie = (
      request.cookies?.["__Secure-better-auth.session_token"] ||
      request.cookies?.["better-auth.session_token"]
    )
    let cookieToken: string | undefined
    if (signedCookie && process.env.BETTER_AUTH_SECRET) {
      const separator = signedCookie.lastIndexOf(".")
      if (separator > 0) {
        const value = signedCookie.slice(0, separator)
        const signature = Buffer.from(signedCookie.slice(separator + 1), "base64")
        const expected = createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(value).digest()
        if (signature.length === expected.length && timingSafeEqual(signature, expected)) cookieToken = value
      }
    }
    const sessionToken = token || cookieToken

    if (!sessionToken) {
      return reply.status(401).send({ error: "Non authentifié" })
    }

    // Vérifier le token de session BetterAuth dans la DB
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session || session.expiresAt <= new Date()) {
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

    if (!user || user.isBanned) {
      return reply.status(401).send({ error: "Session invalide (utilisateur introuvable)" })
    }

    request.userId = user.id
    request.role = (user.role as "ADMIN" | "MEMBER" | "GUEST") || "MEMBER"
    request.isSuperAdmin = user.isSuperAdmin === true

    // Filet de sécurité : si l'utilisateur n'a toujours pas de tenant (le hook BetterAuth l'a déjà créé normalement)
    if (!user.tenantId) {
      // Création atomique : deux requêtes simultanées du même utilisateur ne
      // doivent pas créer deux tenants. La transaction relit le user et ne crée
      // le tenant que si le champ tenantId est encore vide.
      const resolved = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`
        const fresh = await tx.user.findUnique({
          where: { id: user.id },
          select: { tenantId: true, role: true },
        })
        // Tenant déjà créé entre-temps par une requête concurrente : on le réutilise.
        if (fresh?.tenantId) {
          return { tenantId: fresh.tenantId, role: (fresh.role as "ADMIN" | "MEMBER" | "GUEST") || "GUEST", created: false }
        }

        const slug = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-")
        const uniqueSlug = `${slug}-${Date.now().toString(36)}`

        const tenant = await tx.tenant.create({
          data: {
            name: user.name || user.email.split("@")[0],
            slug: uniqueSlug,
            plan: "STARTER",
          },
        })

        await tx.user.update({
          where: { id: user.id },
          data: { tenantId: tenant.id, role: "GUEST" },
        })

        return { tenantId: tenant.id, role: "GUEST" as const, created: true }
      })

      request.tenantId = resolved.tenantId
      request.role = resolved.role
    } else {
      request.tenantId = user.tenantId
    }

    // Bloquer les comptes suspendus
    const tenant = await prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: { isSuspended: true },
    })
    if (!tenant || tenant.isSuspended) {
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
