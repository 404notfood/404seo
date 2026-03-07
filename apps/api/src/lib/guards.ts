import type { FastifyReply, FastifyRequest } from "fastify"

type Role = "ADMIN" | "MEMBER" | "GUEST"

const ROLE_HIERARCHY: Record<Role, number> = {
  GUEST: 0,
  MEMBER: 1,
  ADMIN: 2,
}

/**
 * Guard de rôle — vérifie que l'utilisateur a au minimum le rôle requis.
 * ADMIN > MEMBER > GUEST
 */
export function requireRole(minRole: Role) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userLevel = ROLE_HIERARCHY[request.role] ?? 0
    const requiredLevel = ROLE_HIERARCHY[minRole]

    if (userLevel < requiredLevel) {
      return reply.status(403).send({
        error: "Accès refusé",
        message: `Rôle minimum requis : ${minRole}`,
      })
    }
  }
}

/**
 * Guard de plan — vérifie que le tenant a un plan suffisant.
 */
export function requirePlan(...allowedPlans: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { prisma } = await import("./prisma.js")
    const tenant = await prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: { plan: true },
    })

    if (!tenant || !allowedPlans.includes(tenant.plan)) {
      return reply.status(403).send({
        error: "Plan insuffisant",
        message: `Votre plan actuel ne permet pas cette action. Plans requis : ${allowedPlans.join(", ")}`,
      })
    }
  }
}

/**
 * Guard de feature — vérifie l'accès à une feature en 2 étapes :
 * 1. Override TenantFeature en DB (admin override) → prioritaire
 * 2. Sinon : PlanConfig.feature* du plan actuel du tenant
 */
export function requireFeature(feature: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { resolveFeature } = await import("./features.js")
    const enabled = await resolveFeature(request.tenantId, feature)
    if (!enabled) {
      return reply.status(403).send({
        error: "Feature non disponible",
        message: `La fonctionnalité "${feature}" n'est pas incluse dans votre plan.`,
      })
    }
  }
}

/**
 * Guard de suspension — bloque les tenants suspendus.
 */
export function requireNotSuspended() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { prisma } = await import("./prisma.js")
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
  }
}

/**
 * Guard super-admin — le user doit être ADMIN et ne pas avoir de tenantId propre
 * (ou être marqué comme admin global de la plateforme).
 * Pour simplifier : vérifie juste le rôle ADMIN.
 */
export function requireSuperAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.role !== "ADMIN") {
      return reply.status(403).send({
        error: "Accès refusé",
        message: "Réservé aux administrateurs de la plateforme.",
      })
    }
  }
}

/**
 * Vérifie qu'un projectId appartient bien à l'utilisateur ET au tenant.
 * Retourne le projet si valide, null sinon (à gérer dans la route avec 403/404).
 * Chaque user ne voit que SES propres projets.
 */
export async function assertProjectOwner(
  projectId: string,
  userId: string,
  tenantId: string
): Promise<{ id: string; domain: string; name: string } | null> {
  const { prisma } = await import("./prisma.js")
  return prisma.project.findFirst({
    where: { id: projectId, userId, tenantId },
    select: { id: true, domain: true, name: true },
  })
}
