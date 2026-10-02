import { z } from "zod"
import type { AiUsageSummary } from "@seo/shared"
import { prisma } from "./prisma"
import { CmsError } from "./cmsWordPress"
import { resolveFeature } from "./features"

export interface AiActor { tenantId: string; projectId: string; userId: string }
export interface AiTokenUsage { input_tokens: number; output_tokens: number }
const Prices = z.object({ input: z.coerce.number().positive().max(1000), output: z.coerce.number().positive().max(1000) })
export function aiPrices() { return Prices.safeParse({ input: process.env.OPENAI_SEO_INPUT_USD_PER_MILLION, output: process.env.OPENAI_SEO_OUTPUT_USD_PER_MILLION }) }
export function managedAiConfigured() { return !!process.env.OPENAI_API_KEY && !!process.env.OPENAI_SEO_MODEL && aiPrices().success }
const monthStart = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) }
export async function aiUsage(tenantId: string): Promise<AiUsageSummary> {
  const [tenant, requests, allowed] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true } }),
    prisma.aiRequest.findMany({ where: { tenantId, createdAt: { gte: monthStart() } }, select: { reservedMicros: true, actualMicros: true } }),
    resolveFeature(tenantId, "ai"),
  ])
  const plan = await prisma.planConfig.findUnique({ where: { plan: tenant.plan } })
  const rates = aiPrices()
  return { configured: managedAiConfigured(), allowed: allowed && !!plan?.isActive, used: requests.length, quota: plan?.aiMonthlyQuota ?? 0,
    budgetUsd: (plan?.aiMonthlyBudgetCents ?? 0) / 100, committedUsd: requests.reduce((total, row) => total + (row.actualMicros ?? row.reservedMicros), 0) / 1e6,
    measuredUsd: requests.reduce((total, row) => total + (row.actualMicros ?? 0), 0) / 1e6, uncertainRequests: requests.filter(row => row.actualMicros === null).length,
    nextRequestUsd: rates.success ? Math.ceil(34048 * rates.data.input + 1500 * rates.data.output) / 1e6 : null }
}
/** All managed calls have <=32KB JSON input and at most 1500 generated tokens. */
export async function executeAiRequest<T>(actor: AiActor, purpose: "CMS" | "CHAT" | "VISIBILITY", work: (record: (usage: AiTokenUsage) => Promise<void>) => Promise<T>): Promise<T> {
  const prices = aiPrices()
  if (!managedAiConfigured() || !prices.success) throw new CmsError("Configurez le fournisseur IA et ses tarifs avant la génération.", 503)
  const maximumInput = 32_000 + 2048, maximumOutput = 1500
  const cost = (usage: AiTokenUsage) => Math.ceil(usage.input_tokens * prices.data.input + usage.output_tokens * prices.data.output)
  const reservedMicros = cost({ input_tokens: maximumInput, output_tokens: maximumOutput })
  const reservation = await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', actor.tenantId)
    const [tenant, user, project, override] = await Promise.all([
      tx.tenant.findUnique({ where: { id: actor.tenantId } }),
      tx.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, isBanned: false, role: { in: ["ADMIN", "MEMBER"] } } }),
      tx.project.findFirst({ where: { id: actor.projectId, tenantId: actor.tenantId, userId: actor.userId, deletedAt: null } }),
      tx.tenantFeature.findUnique({ where: { tenantId_feature: { tenantId: actor.tenantId, feature: "ai" } } }),
    ])
    if (!tenant || tenant.isSuspended || !user || !project) throw new CmsError("Accès à l’IA refusé.", 403)
    const config = await tx.planConfig.findUnique({ where: { plan: tenant.plan } })
    if (!config?.isActive || !(override?.enabled ?? config.featureAI)) throw new CmsError("L’IA n’est pas incluse dans votre abonnement.", 403)
    const used = await tx.aiRequest.findMany({ where: { tenantId: actor.tenantId, createdAt: { gte: monthStart() } }, select: { reservedMicros: true, actualMicros: true } })
    if (used.length >= config.aiMonthlyQuota) throw new CmsError("Quota mensuel d’appels IA atteint.", 403)
    const committed = used.reduce((total, row) => total + (row.actualMicros ?? row.reservedMicros), 0)
    if (committed + reservedMicros > config.aiMonthlyBudgetCents * 10_000) throw new CmsError("Le budget IA restant ne couvre pas cet appel.", 403)
    return tx.aiRequest.create({ data: { ...actor, purpose, reservedMicros, model: process.env.OPENAI_SEO_MODEL! } })
  })
  try {
    const result = await work(async usage => {
      const valid = z.object({ input_tokens: z.number().int().nonnegative().max(maximumInput), output_tokens: z.number().int().nonnegative().max(maximumOutput) }).parse(usage)
      await prisma.aiRequest.updateMany({ where: { id: reservation.id, tenantId: actor.tenantId, status: "RESERVED" }, data: { inputTokens: valid.input_tokens, outputTokens: valid.output_tokens, actualMicros: cost(valid) } })
    })
    await prisma.aiRequest.updateMany({ where: { id: reservation.id, tenantId: actor.tenantId, status: "RESERVED" }, data: { status: "COMPLETED" } })
    return result
  } catch (error) {
    // A timeout can still have been billed: keep its reservation until manually reconciled.
    await prisma.aiRequest.updateMany({ where: { id: reservation.id, tenantId: actor.tenantId, status: "RESERVED" }, data: { status: "FAILED" } })
    throw error
  }
}
