// lib/quotas.ts — Vérification centralisée des quotas par plan
import type { FastifyRequest, FastifyReply } from "fastify"
import { prisma } from "./prisma"

interface PlanQuotas {
  auditQuota: number   // -1 = unlimited
  pageQuota: number
  projectQuota: number // -1 = unlimited
  userQuota: number
}

// Quotas par défaut si PlanConfig non trouvé en DB
const DEFAULT_QUOTAS: Record<string, PlanQuotas> = {
  STARTER: { auditQuota: 5, pageQuota: 100, projectQuota: 3, userQuota: 1 },
  PRO:     { auditQuota: 100, pageQuota: 10000, projectQuota: 20, userQuota: 5 },
  AGENCY:  { auditQuota: -1, pageQuota: 100000, projectQuota: -1, userQuota: 20 },
}

async function getQuotas(tenantId: string): Promise<PlanQuotas & { plan: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  })
  const plan = tenant?.plan ?? "STARTER"

  const config = await prisma.planConfig.findUnique({
    where: { plan },
    select: { auditQuota: true, pageQuota: true, projectQuota: true, userQuota: true },
  })

  const defaults = DEFAULT_QUOTAS[plan] ?? DEFAULT_QUOTAS.STARTER
  return {
    plan,
    auditQuota: config?.auditQuota ?? defaults.auditQuota,
    pageQuota: config?.pageQuota ?? defaults.pageQuota,
    projectQuota: config?.projectQuota ?? defaults.projectQuota,
    userQuota: config?.userQuota ?? defaults.userQuota,
  }
}

/**
 * Guard : vérifie que le tenant n'a pas dépassé son quota d'audits pour le mois en cours
 */
export function requireAuditQuota() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const quotas = await getQuotas(request.tenantId)
    if (quotas.auditQuota === -1) return // illimité

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const auditsThisMonth = await prisma.audit.count({
      where: {
        tenantId: request.tenantId,
        createdAt: { gte: startOfMonth },
        deletedAt: null,
      },
    })

    if (auditsThisMonth >= quotas.auditQuota) {
      return reply.status(403).send({
        error: "Quota audits atteint",
        message: `Votre plan ${quotas.plan} est limité à ${quotas.auditQuota} audits/mois. Utilisé : ${auditsThisMonth}/${quotas.auditQuota}.`,
        upgrade: true,
      })
    }
  }
}

/**
 * Guard : vérifie que le tenant n'a pas dépassé son quota de projets
 */
export function requireProjectQuota() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const quotas = await getQuotas(request.tenantId)
    if (quotas.projectQuota === -1) return // illimité

    const projectCount = await prisma.project.count({
      where: { tenantId: request.tenantId },
    })

    if (projectCount >= quotas.projectQuota) {
      return reply.status(403).send({
        error: "Quota projets atteint",
        message: `Votre plan ${quotas.plan} est limité à ${quotas.projectQuota} projets. Utilisé : ${projectCount}/${quotas.projectQuota}.`,
        upgrade: true,
      })
    }
  }
}

/**
 * Incrémente le compteur pagesUsed après un audit terminé
 */
export async function incrementPagesUsed(tenantId: string, pagesCount: number) {
  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { pagesUsed: { increment: pagesCount } },
  })
}
