import type { FastifyPluginAsync } from "fastify"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { Prisma } from "@prisma/client"
import type { ProjectCms } from "@seo/shared"
import { prisma } from "../lib/prisma"
import { requireRole } from "../lib/guards"
import { resolveFeature } from "../lib/features"
import { cmsAiConfigured } from "../lib/cmsAI"
import { cmsConfigured, CmsError, encryptCmsCredentials, wordpressBase } from "../lib/cmsWordPress"

import { createCmsService, cmsSummary as summary, type CmsRouteOptions } from "../lib/cmsService"
import { batchSummary, createCmsBatch } from "../lib/cmsBatch"
import { aiUsage } from "../lib/aiBudget"
const Scope = z.object({ projectId: z.string().min(1).max(100), id: z.string().min(1).max(100).optional() })
const Connect = z.union([
  z.object({ provider: z.literal("WORDPRESS").default("WORDPRESS"), siteUrl: z.string().url().max(2048), username: z.string().min(1).max(100).regex(/^[^:\r\n]+$/),
    applicationPassword: z.string().max(100).transform(value => value.replace(/ /g, "")).pipe(z.string().regex(/^[a-zA-Z0-9]{24}$/)) }).strict(),
  z.object({ provider: z.literal("PRESTASHOP"), siteUrl: z.string().url().max(2048), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
])
const OPERATING = ["APPLYING", "RESTORING", "UNCERTAIN"]
const context = (connection: { id: string; tenantId: string; projectId: string; siteUrl: string; provider: string; scope: string }) =>
  JSON.stringify([connection.tenantId, connection.projectId, connection.provider, connection.id, connection.siteUrl, ...(connection.provider === "WORDPRESS" ? [] : [connection.scope])])
// SQL identifiers are fixed; all values are bound parameters.
const lockConnection = (tx: Prisma.TransactionClient, id: string, tenantId: string) =>
  tx.$queryRawUnsafe('SELECT id FROM cms_connections WHERE id = $1 AND "tenantId" = $2 FOR UPDATE', id, tenantId)
const cmsRoutes: FastifyPluginAsync<CmsRouteOptions> = async (fastify, options) => {
  const { factory, prestaFactory, client, guarded, activeConnection, quota, routeError, generateCorrection, publishCorrection } = createCmsService(options)
  const readRate = { rateLimit: { max: 20, timeWindow: "1 minute" } }
  const mutateRate = { rateLimit: { max: 6, timeWindow: "1 minute" } }
  const prefix = "/api/projects/:projectId/cms"

  fastify.get<{ Params: { projectId: string } }>(prefix, { config: readRate }, async request => {
    const { projectId } = Scope.parse(request.params); await guarded(projectId, request.userId, request.tenantId)
    await prisma.cmsCorrection.updateMany({ where: { tenantId: request.tenantId, connection: { projectId }, status: "GENERATING", updatedAt: { lt: new Date(Date.now() - 120_000) } },
      data: { status: "FAILED", reason: "La génération a été interrompue. Aucune publication." } })
    const [connection, corrections, ai, publish, usage, batches, aiSummary] = await Promise.all([
      prisma.cmsConnection.findFirst({ where: { projectId, tenantId: request.tenantId, disconnectedAt: null } }),
      prisma.cmsCorrection.findMany({ where: { tenantId: request.tenantId, connection: { projectId } }, orderBy: { createdAt: "desc" }, take: 50 }),
      resolveFeature(request.tenantId, "ai"), resolveFeature(request.tenantId, "cms_corrections"), quota(request.tenantId),
      prisma.cmsBatch.findMany({ where: { projectId, tenantId: request.tenantId }, orderBy: { createdAt: "desc" }, take: 20 }),
      aiUsage(request.tenantId),
    ])
    const member = request.role !== "GUEST"
    const result: ProjectCms = { connection: connection ? { id: connection.id, siteUrl: connection.siteUrl, label: connection.label, provider: connection.provider as "WORDPRESS" | "PRESTASHOP", scope: connection.scope, verifiedAt: connection.verifiedAt.toISOString() } : null,
      corrections: corrections.map(summary), batches: batches.map(batchSummary), aiUsage: aiSummary, access: { connect: member, generate: member && ai && publish, publish: member && publish,
        configured: cmsConfigured(), aiConfigured: cmsAiConfigured(), ...usage } }
    return result
  })
  fastify.post<{ Params: { projectId: string } }>(prefix + "/connection", { preHandler: [requireRole("MEMBER")], config: mutateRate }, async request => {
    const parsed = Connect.safeParse(request.body)
    if (!parsed.success) throw new CmsError("Adresse ou identifiants CMS invalides.")
    const { projectId } = Scope.parse(request.params), tenantId = request.tenantId
    const project = await guarded(projectId, request.userId, tenantId)
    if (!cmsConfigured()) throw new CmsError("Les connexions CMS ne sont pas encore activées.", 503)
    const siteUrl = wordpressBase(parsed.data.siteUrl, project.domain), id = randomUUID()
    try {
      const input = parsed.data, provider = input.provider
      const secret = input.provider === "PRESTASHOP" ? { token: input.token } : { username: input.username, applicationPassword: input.applicationPassword }
      const verified = input.provider === "PRESTASHOP" ? await prestaFactory(siteUrl, { token: input.token }, "").verify() : await factory(siteUrl, { username: input.username, applicationPassword: input.applicationPassword }).verify()
      const label = verified.label, scope = "scope" in verified ? String(verified.scope) : ""
      await prisma.$transaction(async tx => {
        await tx.$queryRawUnsafe('SELECT id FROM projects WHERE id = $1 AND "tenantId" = $2 FOR UPDATE', projectId, tenantId)
        const active = await tx.cmsConnection.findFirst({ where: { projectId, tenantId, disconnectedAt: null } })
        if (active) {
          await lockConnection(tx, active.id, tenantId)
          if (active.siteUrl === siteUrl && active.provider === provider && active.scope === scope) {
            // Rotating access to the same site preserves backups and lets an uncertain operation be reconciled.
            await tx.cmsConnection.update({ where: { id: active.id }, data: { label, verifiedAt: new Date(),
              credentials: encryptCmsCredentials(secret, context(active)) } })
            return
          }
          if (await tx.cmsBatch.count({ where: { connectionId: active.id, tenantId, status: { in: ["QUEUED", "RUNNING"] } } }) || await tx.cmsCorrection.count({ where: { connectionId: active.id, tenantId, status: { in: OPERATING } } })) throw new CmsError("Arrêtez le lot et vérifiez les opérations avant de reconnecter le site.", 409)
          await tx.cmsConnection.update({ where: { id: active.id }, data: { disconnectedAt: new Date(), credentials: "" } })
        }
        await tx.cmsConnection.create({ data: { id, projectId, tenantId, siteUrl, label, provider, scope, credentials: encryptCmsCredentials(
          secret, context({ id, projectId, tenantId, siteUrl, provider, scope })) } })
      })
      return { connected: true }
    } catch (error) { return routeError(error) }
  })
  fastify.delete<{ Params: { projectId: string } }>(prefix + "/connection", { preHandler: [requireRole("MEMBER")], config: mutateRate }, async request => {
    const { projectId } = Scope.parse(request.params); await guarded(projectId, request.userId, request.tenantId)
    const connection = await activeConnection(projectId, request.tenantId)
    await prisma.$transaction(async tx => {
      await lockConnection(tx, connection.id, request.tenantId)
      if (await tx.cmsBatch.count({ where: { connectionId: connection.id, tenantId: request.tenantId, status: { in: ["QUEUED", "RUNNING"] } } }) || await tx.cmsCorrection.count({ where: { connectionId: connection.id, tenantId: request.tenantId, status: { in: OPERATING } } })) throw new CmsError("Arrêtez le lot et vérifiez les opérations avant de déconnecter.", 409)
      await tx.cmsConnection.update({ where: { id: connection.id }, data: { disconnectedAt: new Date(), credentials: "" } })
    })
    return { disconnected: true }
  })
  fastify.get<{ Params: { projectId: string } }>(prefix + "/resources", { preHandler: [requireRole("MEMBER")], config: readRate }, async request => {
    const parsed = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), kind: z.enum(["post", "page", "product", "category", "cms"]).default("page") }).strict().safeParse(request.query)
    if (!parsed.success) throw new CmsError("Filtres invalides.")
    const { projectId } = Scope.parse(request.params); await guarded(projectId, request.userId, request.tenantId)
    try { return await client(await activeConnection(projectId, request.tenantId)).list(parsed.data.page, parsed.data.kind) }
    catch (error) { return routeError(error) }
  })
  fastify.post<{ Params: { projectId: string } }>(prefix + "/corrections", { preHandler: [requireRole("MEMBER")], config: mutateRate }, async request => {
    return generateCorrection({ projectId: Scope.parse(request.params).projectId, tenantId: request.tenantId, userId: request.userId }, request.body)
  })
  fastify.post<{ Params: { projectId: string } }>(prefix + "/batches", { preHandler: [requireRole("MEMBER")], config: mutateRate }, async (request, reply) => {
    const projectId = Scope.parse(request.params).projectId
    const batch = await createCmsBatch({ projectId, userId: request.userId, tenantId: request.tenantId }, request.body, options)
    try {
      if (options.enqueue) await options.enqueue(batch.id)
      else await (await import("../lib/cmsQueue.js")).enqueueCmsBatch(batch.id)
    } catch { fastify.log.warn({ batchId: batch.id }, "CMS batch saved; worker will recover queue handoff") }
    return reply.code(202).send(batchSummary(batch))
  })
  fastify.post<{ Params: { projectId: string; id: string } }>(prefix + "/batches/:id/cancel", { preHandler: [requireRole("MEMBER")], config: mutateRate }, async request => {
    const { projectId, id } = Scope.parse(request.params)
    await guarded(projectId, request.userId, request.tenantId)
    const batch = await prisma.cmsBatch.findFirst({ where: { id, projectId, tenantId: request.tenantId } })
    if (!batch) throw new CmsError("Lot introuvable.", 404)
    await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM cms_batches WHERE id=$1 AND "tenantId"=$2 FOR UPDATE', batch.id, request.tenantId)
      const current = await tx.cmsBatch.findUniqueOrThrow({ where: { id: batch.id } })
      if (!["QUEUED", "RUNNING"].includes(current.status)) return
      await tx.cmsBatch.update({ where: { id: current.id }, data: { cancelRequested: true, ...(current.status === "QUEUED" ? { status: "CANCELLED", finishedAt: new Date() } : {}) } })
      if (current.status === "QUEUED" && current.action === "GENERATE") {
        const ids = z.array(z.string()).parse(current.correctionIds)
        await tx.cmsCorrection.updateMany({ where: { id: { in: ids }, tenantId: request.tenantId, status: "QUEUED" }, data: { status: "FAILED", reason: "Lot arrêté avant cette génération. Aucune publication." } })
      }
    })
    return batchSummary(await prisma.cmsBatch.findUniqueOrThrow({ where: { id: batch.id } }))
  })
  fastify.addHook("onClose", async () => { if (!options.enqueue) await (await import("../lib/cmsQueue.js")).closeCmsQueue() })
  for (const action of ["apply", "restore", "reconcile"] as const) {
    fastify.post<{ Params: { projectId: string; id: string } }>(prefix + "/corrections/:id/" + action, { preHandler: [requireRole("MEMBER")], config: mutateRate }, async request => {
      const { projectId, id } = Scope.parse(request.params)
      if (!id) throw new CmsError("Proposition invalide.")
      if (request.body && (typeof request.body !== "object" || Object.keys(request.body).length)) throw new CmsError("Aucun champ de publication modifiable n’est accepté.")
      return publishCorrection({ projectId, tenantId: request.tenantId, userId: request.userId }, id, action)
    })
  }
}
export default cmsRoutes
