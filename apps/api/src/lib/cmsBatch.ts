import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { CmsBatch } from "@prisma/client"
import type { CmsBatchSummary } from "@seo/shared"
import { prisma } from "./prisma"
import { createCmsService, type CmsActor, type CmsRouteOptions } from "./cmsService"
import { CmsError } from "./cmsWordPress"
import { cmsAiConfigured } from "./cmsAI"

const Ids = z.array(z.string().min(1).max(100)).min(1).max(50)
const Resource = z.object({ id: z.number().int().positive().max(2147483647), kind: z.enum(["post", "page", "product", "category", "cms"]) }).strict()
export const CmsBatchInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("GENERATE"), mode: z.enum(["SEO", "SPELLING", "CONTENT", "ALT"]), resources: z.array(Resource).min(1).max(50) }).strict(),
  z.object({ action: z.literal("APPLY"), correctionIds: Ids, confirmed: z.literal(true) }).strict(),
])
const active = ["QUEUED", "RUNNING"]
export function batchSummary(batch: CmsBatch): CmsBatchSummary {
  return { id: batch.id, action: batch.action as CmsBatchSummary["action"], status: batch.status as CmsBatchSummary["status"], total: Ids.parse(batch.correctionIds).length,
    completed: batch.completed, failed: batch.failed, cancelRequested: batch.cancelRequested, createdAt: batch.createdAt.toISOString() }
}
export async function createCmsBatch(actor: CmsActor, input: unknown, options: CmsRouteOptions = {}) {
  const parsed = CmsBatchInput.safeParse(input)
  if (!parsed.success) throw new CmsError("Sélection de lot invalide (1 à 50 contenus).")
  const data = parsed.data, service = createCmsService(options)
  await service.guarded(actor.projectId, actor.userId, actor.tenantId)
  const connection = await service.activeConnection(actor.projectId, actor.tenantId)
  if (data.action === "GENERATE" && !cmsAiConfigured()) throw new CmsError("La génération IA n’est pas activée.", 503)
  return prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', actor.tenantId)
    await tx.$queryRawUnsafe('SELECT id FROM cms_connections WHERE id=$1 AND "tenantId"=$2 FOR UPDATE', connection.id, actor.tenantId)
    const config = await service.accessAtExecution(tx, actor.tenantId, actor.userId, actor.projectId, data.action === "GENERATE")
    if ((await tx.cmsConnection.findUniqueOrThrow({ where: { id: connection.id } })).disconnectedAt) throw new CmsError("Connexion remplacée.", 409)
    if (await tx.cmsBatch.count({ where: { tenantId: actor.tenantId, connectionId: connection.id, status: { in: active } } })) throw new CmsError("Un lot est déjà en attente sur ce site.", 409)
    let correctionIds: string[]
    if (data.action === "GENERATE") {
      const keys = data.resources.map(value => value.kind + ":" + value.id)
      if (new Set(keys).size !== keys.length) throw new CmsError("La sélection contient des doublons.")
      if (data.resources.some(value => connection.provider === "PRESTASHOP" ? !["product", "category", "cms"].includes(value.kind) : !["page", "post", "product"].includes(value.kind))) throw new CmsError("Contenu incompatible avec ce CMS.")
      const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      const used = await tx.cmsCorrection.count({ where: { tenantId: actor.tenantId, createdAt: { gte: start } } })
      if (used + data.resources.length > (config?.cmsMonthlyQuota ?? 0)) throw new CmsError("Le quota restant ne couvre pas cette sélection.", 403)
      correctionIds = []
      for (const resource of data.resources) {
        const row = await tx.cmsCorrection.create({ data: { tenantId: actor.tenantId, connectionId: connection.id, resourceId: resource.id, resourceKind: resource.kind,
          mode: data.mode, status: "QUEUED", title: "Contenu en attente", resourceUrl: connection.siteUrl, beforeRevision: "" } })
        correctionIds.push(row.id)
      }
    } else {
      correctionIds = data.correctionIds
      if (new Set(correctionIds).size !== correctionIds.length) throw new CmsError("La sélection contient des doublons.")
      const drafts = await tx.cmsCorrection.findMany({ where: { id: { in: correctionIds }, tenantId: actor.tenantId, connectionId: connection.id, status: "DRAFT" } })
      if (drafts.length !== correctionIds.length) throw new CmsError("Une proposition n’est plus disponible. Actualisez l’aperçu.", 409)
      if (new Set(drafts.map(value => value.resourceKind + ":" + value.resourceId)).size !== drafts.length) throw new CmsError("Choisissez une seule proposition par contenu.")
    }
    return tx.cmsBatch.create({ data: { ...actor, connectionId: connection.id, action: data.action, mode: data.action === "GENERATE" ? data.mode : "SEO", correctionIds } })
  })
}

/** DB is the outbox and source of progress. Redis contains only the batch ID, never CMS credentials. */
export async function processCmsBatch(id: string, options: CmsRouteOptions = {}) {
  const token = randomUUID(), lease = () => new Date(Date.now() + 300_000), service = createCmsService(options)
  const batch = await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe('SELECT id FROM cms_batches WHERE id=$1 FOR UPDATE', id)
    const current = await tx.cmsBatch.findUnique({ where: { id } })
    if (!current || !active.includes(current.status) || current.status === "RUNNING" && current.leaseUntil && current.leaseUntil > new Date()) return null
    // Never repeat a paid generation or uncertain publication after a crashed worker.
    const ids = Ids.parse(current.correctionIds)
    await tx.cmsCorrection.updateMany({ where: { id: { in: ids }, tenantId: current.tenantId, status: "GENERATING" }, data: { status: "FAILED", reason: "Génération interrompue. Aucune publication." } })
    await tx.cmsCorrection.updateMany({ where: { id: { in: ids }, tenantId: current.tenantId, status: { in: ["APPLYING", "RESTORING"] } }, data: { status: "UNCERTAIN" } })
    return tx.cmsBatch.update({ where: { id }, data: { status: "RUNNING", runToken: token, leaseUntil: lease() } })
  })
  if (!batch) return
  const ids = Ids.parse(batch.correctionIds), actor = { tenantId: batch.tenantId, projectId: batch.projectId, userId: batch.userId }
  let stopped = false
  for (let index = batch.completed; index < ids.length; index++) {
    const current = await prisma.cmsBatch.findUniqueOrThrow({ where: { id } })
    if (current.runToken !== token) return
    if (current.cancelRequested) { stopped = true; break }
    let failed = false
    try {
      const row = await prisma.cmsCorrection.findFirstOrThrow({ where: { id: ids[index], tenantId: batch.tenantId, connectionId: batch.connectionId } })
      if ((await service.activeConnection(batch.projectId, batch.tenantId)).id !== batch.connectionId) throw new CmsError("Connexion remplacée.", 409)
      const result = batch.action === "GENERATE"
        ? row.status === "QUEUED" ? await service.generateCorrection(actor, { resourceId: row.resourceId, kind: row.resourceKind, mode: row.mode }, row.id) : row
        : await service.publishCorrection(actor, row.id, "apply")
      failed = !["DRAFT", "APPLIED"].includes(result.status)
    } catch {
      failed = true
      await prisma.cmsCorrection.updateMany({ where: { id: ids[index], tenantId: batch.tenantId, status: { in: ["QUEUED", "GENERATING"] } }, data: { status: "FAILED", reason: "Traitement impossible. Vérifiez l’accès, le quota et la connexion." } })
    }
    await prisma.cmsBatch.updateMany({ where: { id, runToken: token, status: "RUNNING" }, data: { completed: index + 1, failed: { increment: failed ? 1 : 0 }, leaseUntil: lease() } })
    // Stop the entire publication batch when the remote result needs reconciliation.
    if (batch.action === "APPLY" && await prisma.cmsCorrection.count({ where: { id: ids[index], tenantId: batch.tenantId, status: "UNCERTAIN" } })) { stopped = true; break }
  }
  if (batch.action === "GENERATE") await prisma.cmsCorrection.updateMany({ where: { id: { in: ids }, tenantId: batch.tenantId, status: "QUEUED" }, data: { status: "FAILED", reason: "Lot arrêté avant cette génération. Aucune publication." } })
  await prisma.cmsBatch.updateMany({ where: { id, runToken: token, status: "RUNNING" }, data: { status: stopped ? "CANCELLED" : "COMPLETED", finishedAt: new Date(), leaseUntil: null } })
}
