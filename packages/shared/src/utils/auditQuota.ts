import type { Prisma } from "@prisma/client"

export class AuditQuotaError extends Error {}

export async function assertProjectCapacity(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant || tenant.isSuspended) throw new AuditQuotaError("Compte suspendu ou introuvable")
  const config = await tx.planConfig.findUnique({ where: { plan: tenant.plan } })
  const limit = config?.projectQuota ?? (tenant.plan === "STARTER" ? 3 : tenant.plan === "PRO" ? 20 : -1)
  if (limit !== -1 && await tx.project.count({ where: { tenantId, deletedAt: null } }) >= limit) {
    throw new AuditQuotaError("Quota de projets atteint")
  }
}

/** Call inside the transaction that creates the audit. Serialize launches per tenant. */
export async function assertAuditCapacity(tx: Prisma.TransactionClient, tenantId: string, maxPages: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant || tenant.isSuspended) throw new AuditQuotaError("Compte suspendu ou introuvable")
  const config = await tx.planConfig.findUnique({ where: { plan: tenant.plan } })
  const defaults = tenant.plan === "STARTER" ? { audits: 5, pages: 100 }
    : tenant.plan === "PRO" ? { audits: 100, pages: 10000 } : { audits: -1, pages: 100000 }
  const auditQuota = config?.auditQuota ?? defaults.audits
  const pageQuota = config?.pageQuota ?? defaults.pages
  const month = new Date()
  month.setUTCDate(1)
  month.setUTCHours(0, 0, 0, 0)
  const audits = await tx.audit.findMany({
    where: { tenantId, createdAt: { gte: month } },
    select: { status: true, options: true, report: { select: { totalPages: true } } },
  })
  if (auditQuota !== -1 && audits.length >= auditQuota) throw new AuditQuotaError("Quota mensuel d'audits atteint")
  // Completed reports include soft-deleted audits; active jobs reserve their full budget.
  const used = audits.reduce((sum, audit) => {
    if (audit.report) return sum + (audit.report.totalPages ?? 0)
    if (["FAILED", "CANCELLED"].includes(audit.status)) return sum
    const options = audit.options as { maxPages?: number } | null
    return sum + (options?.maxPages ?? 100)
  }, 0)
  if (pageQuota !== -1 && used + maxPages > pageQuota) {
    throw new AuditQuotaError(`Quota pages dépassé : ${Math.max(0, pageQuota - used)} page(s) disponible(s)`)
  }
}
