import type { FastifyPluginAsync } from "fastify"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { CmsConnection, CmsCorrection, Prisma } from "@prisma/client"
import type { CmsCorrectionSummary, CmsResource, ProjectCms } from "@seo/shared"
import { prisma } from "../lib/prisma"
import { assertProjectOwner, requireRole } from "../lib/guards"
import { resolveFeature } from "../lib/features"
import { cmsAiConfigured, CmsProposal, generateCmsProposal } from "../lib/cmsAI"
import { cmsConfigured, CmsError, decryptCmsCredentials, decryptCmsSecret, encryptCmsCredentials, wordpressBase, WordPressClient } from "../lib/cmsWordPress"
import { PrestaShopClient, PrestaShopCredentials } from "../lib/cmsPrestaShop"

interface CmsRouteOptions {
  clientFactory?: (siteUrl: string, credentials: { username: string; applicationPassword: string }) => WordPressClient
  prestaFactory?: (siteUrl: string, credentials: { token: string }, scope: string) => PrestaShopClient
  generate?: typeof generateCmsProposal
}
const Scope = z.object({ projectId: z.string().min(1).max(100), id: z.string().min(1).max(100).optional() })
const Connect = z.union([
  z.object({ provider: z.literal("WORDPRESS").default("WORDPRESS"), siteUrl: z.string().url().max(2048), username: z.string().min(1).max(100).regex(/^[^:\r\n]+$/),
    applicationPassword: z.string().max(100).transform(value => value.replace(/ /g, "")).pipe(z.string().regex(/^[a-zA-Z0-9]{24}$/)) }).strict(),
  z.object({ provider: z.literal("PRESTASHOP"), siteUrl: z.string().url().max(2048), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
])
const Draft = z.object({ resourceId: z.number().int().positive().max(2147483647), mode: z.enum(["SEO", "SPELLING"]) }).strict()
const OPERATING = ["APPLYING", "RESTORING", "UNCERTAIN"]
const monthStart = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) }
const context = (connection: { id: string; tenantId: string; projectId: string; siteUrl: string; provider: string; scope: string }) =>
  JSON.stringify([connection.tenantId, connection.projectId, connection.provider, connection.id, connection.siteUrl, ...(connection.provider === "WORDPRESS" ? [] : [connection.scope])])
// SQL identifiers are fixed; all values are bound parameters.
const lockConnection = (tx: Prisma.TransactionClient, id: string, tenantId: string) =>
  tx.$queryRawUnsafe('SELECT id FROM cms_connections WHERE id = $1 AND "tenantId" = $2 FOR UPDATE', id, tenantId)
function summary(item: CmsCorrection): CmsCorrectionSummary {
  return { id: item.id, connectionId: item.connectionId, resourceId: item.resourceId, resourceUrl: item.resourceUrl, title: item.title,
    mode: item.mode as CmsCorrectionSummary["mode"], beforeTitle: item.beforeTitle, beforeDescription: item.beforeDescription,
    afterTitle: item.afterTitle, afterDescription: item.afterDescription, reason: item.reason,
    status: item.status as CmsCorrectionSummary["status"], direction: item.direction as CmsCorrectionSummary["direction"], createdAt: item.createdAt.toISOString() }
}
const cmsRoutes: FastifyPluginAsync<CmsRouteOptions> = async (fastify, options) => {
  const factory = options.clientFactory ?? ((url, credentials) => new WordPressClient(url, credentials))
  const prestaFactory = options.prestaFactory ?? ((url, credentials, scope) => new PrestaShopClient(url, credentials, scope))
  const client = (connection: CmsConnection) => {
    if (connection.provider === "PRESTASHOP") return prestaFactory(connection.siteUrl, PrestaShopCredentials.parse(decryptCmsSecret(connection.credentials, context(connection))), connection.scope)
    if (connection.provider !== "WORDPRESS") throw new CmsError("Connecteur inconnu.", 503)
    return factory(connection.siteUrl, decryptCmsCredentials(connection.credentials, context(connection)))
  }
  const generate = options.generate ?? generateCmsProposal
  const guarded = async (projectId: string, userId: string, tenantId: string) => {
    const project = await assertProjectOwner(projectId, userId, tenantId)
    if (!project) throw new CmsError("Projet introuvable", 404)
    return project
  }
  const activeConnection = async (projectId: string, tenantId: string) => {
    const connection = await prisma.cmsConnection.findFirst({ where: { projectId, tenantId, disconnectedAt: null } })
    if (!connection) throw new CmsError("Connectez d’abord le CMS.")
    return connection
  }
  const quota = async (tenantId: string) => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true } })
    const config = await prisma.planConfig.findUnique({ where: { plan: tenant.plan }, select: { cmsMonthlyQuota: true } })
    return { quota: Math.max(0, config?.cmsMonthlyQuota ?? 0), used: await prisma.cmsCorrection.count({ where: { tenantId, createdAt: { gte: monthStart() } } }) }
  }
  const writeRight = async (tenantId: string) => {
    if (!await resolveFeature(tenantId, "cms_corrections")) throw new CmsError("Les corrections CMS ne sont pas incluses dans votre abonnement.", 403)
  }
  const accessAtExecution = async (tx: Prisma.TransactionClient, tenantId: string, userId: string, projectId: string, ai = false) => {
    const [user, project, tenant, overrides] = await Promise.all([
      tx.user.findFirst({ where: { id: userId, tenantId, isBanned: false, role: { in: ["ADMIN", "MEMBER"] } }, select: { id: true } }),
      tx.project.findFirst({ where: { id: projectId, tenantId, userId, deletedAt: null }, select: { id: true } }),
      tx.tenant.findUnique({ where: { id: tenantId } }),
      tx.tenantFeature.findMany({ where: { tenantId, feature: { in: ["ai", "cms_corrections"] } } }),
    ])
    if (!user || !tenant || tenant.isSuspended) throw new CmsError("Accès aux corrections CMS refusé.", 403)
    if (!project) throw new CmsError("Projet introuvable", 404)
    const config = await tx.planConfig.findUnique({ where: { plan: tenant.plan } })
    const cms = overrides.find(value => value.feature === "cms_corrections")?.enabled ?? config?.featureCmsCorrections ?? false
    const generation = overrides.find(value => value.feature === "ai")?.enabled ?? config?.featureAI ?? false
    if (!cms || ai && !generation) throw new CmsError("Cette fonctionnalité n’est plus incluse dans votre abonnement.", 403)
    return config
  }
  const routeError = (error: unknown): never => {
    if (error instanceof CmsError) throw error
    if (error instanceof z.ZodError) throw new CmsError("Réponse du connecteur invalide.", 502)
    throw error
  }
  const readRate = { rateLimit: { max: 20, timeWindow: "1 minute" } }
  const mutateRate = { rateLimit: { max: 6, timeWindow: "1 minute" } }
  const prefix = "/api/projects/:projectId/cms"

  fastify.get<{ Params: { projectId: string } }>(prefix, { config: readRate }, async request => {
    const { projectId } = Scope.parse(request.params); await guarded(projectId, request.userId, request.tenantId)
    await prisma.cmsCorrection.updateMany({ where: { tenantId: request.tenantId, connection: { projectId }, status: "GENERATING", updatedAt: { lt: new Date(Date.now() - 120_000) } },
      data: { status: "FAILED", reason: "La génération a été interrompue. Aucune publication." } })
    const [connection, corrections, ai, publish, usage] = await Promise.all([
      prisma.cmsConnection.findFirst({ where: { projectId, tenantId: request.tenantId, disconnectedAt: null } }),
      prisma.cmsCorrection.findMany({ where: { tenantId: request.tenantId, connection: { projectId } }, orderBy: { createdAt: "desc" }, take: 50 }),
      resolveFeature(request.tenantId, "ai"), resolveFeature(request.tenantId, "cms_corrections"), quota(request.tenantId),
    ])
    const member = request.role !== "GUEST"
    const result: ProjectCms = { connection: connection ? { id: connection.id, siteUrl: connection.siteUrl, label: connection.label, provider: connection.provider as "WORDPRESS" | "PRESTASHOP", scope: connection.scope, verifiedAt: connection.verifiedAt.toISOString() } : null,
      corrections: corrections.map(summary), access: { connect: member, generate: member && ai && publish, publish: member && publish,
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
          if (await tx.cmsCorrection.count({ where: { connectionId: active.id, tenantId, status: { in: OPERATING } } })) throw new CmsError("Vérifiez l’opération en attente avant de reconnecter le site.", 409)
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
      if (await tx.cmsCorrection.count({ where: { connectionId: connection.id, tenantId: request.tenantId, status: { in: OPERATING } } })) throw new CmsError("Vérifiez l’opération en attente avant de déconnecter.", 409)
      await tx.cmsConnection.update({ where: { id: connection.id }, data: { disconnectedAt: new Date(), credentials: "" } })
    })
    return { disconnected: true }
  })
  fastify.get<{ Params: { projectId: string } }>(prefix + "/resources", { preHandler: [requireRole("MEMBER")], config: readRate }, async request => {
    const parsed = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1), kind: z.enum(["post", "page", "product"]).default("page") }).strict().safeParse(request.query)
    if (!parsed.success) throw new CmsError("Filtres invalides.")
    const { projectId } = Scope.parse(request.params); await guarded(projectId, request.userId, request.tenantId)
    try { return await client(await activeConnection(projectId, request.tenantId)).list(parsed.data.page, parsed.data.kind) }
    catch (error) { return routeError(error) }
  })
  fastify.post<{ Params: { projectId: string } }>(prefix + "/corrections", { preHandler: [requireRole("MEMBER")], config: mutateRate }, async request => {
    const parsed = Draft.safeParse(request.body)
    if (!parsed.success) throw new CmsError("Page ou mode de correction invalide.")
    const { projectId } = Scope.parse(request.params), tenantId = request.tenantId
    await guarded(projectId, request.userId, tenantId); await writeRight(tenantId)
    if (!await resolveFeature(tenantId, "ai")) throw new CmsError("La génération IA n’est pas incluse dans votre abonnement.", 403)
    if (!cmsAiConfigured()) throw new CmsError("La génération IA n’est pas encore activée.", 503)
    const connection = await activeConnection(projectId, tenantId)
    let resource: CmsResource
    try { resource = await client(connection).read(parsed.data.resourceId) } catch (error) { return routeError(error) }
    if (parsed.data.mode === "SPELLING" && !resource.seoTitle && !resource.seoDescription) throw new CmsError("Aucun champ SEO géré par le connecteur à corriger. Utilisez d’abord « Améliorer mon SEO ».")
    const correction = await prisma.$transaction(async tx => {
      // Tenant lock serializes monthly reservations across all client projects.
      await tx.$queryRawUnsafe('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', tenantId)
      await lockConnection(tx, connection.id, tenantId)
      if ((await tx.cmsConnection.findUniqueOrThrow({ where: { id: connection.id } })).disconnectedAt) throw new CmsError("La connexion a été remplacée.", 409)
      const config = await accessAtExecution(tx, tenantId, request.userId, projectId, true)
      const used = await tx.cmsCorrection.count({ where: { tenantId, createdAt: { gte: monthStart() } } })
      if (used >= (config?.cmsMonthlyQuota ?? 0)) throw new CmsError("Quota mensuel de propositions CMS atteint.", 403)
      return tx.cmsCorrection.create({ data: { tenantId, connectionId: connection.id, resourceId: resource.id, resourceUrl: resource.url, title: resource.title,
        mode: parsed.data.mode, beforeTitle: resource.seoTitle, beforeDescription: resource.seoDescription, beforeRevision: resource.revision } })
    })
    try {
      const proposal = CmsProposal.parse(await generate(resource, parsed.data.mode))
      if (connection.provider === "PRESTASHOP" && /[={}]/.test(proposal.seoTitle + proposal.seoDescription)) throw new CmsError("La proposition contient des caractères refusés par PrestaShop.", 502)
      const afterTitle = parsed.data.mode === "SPELLING" && resource.seoTitle === null ? null : proposal.seoTitle
      const afterDescription = parsed.data.mode === "SPELLING" && resource.seoDescription === null ? null : proposal.seoDescription
      const changed = afterTitle !== resource.seoTitle || afterDescription !== resource.seoDescription
      await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, status: "GENERATING" }, data: { status: changed ? "DRAFT" : "FAILED", afterTitle, afterDescription,
        reason: changed ? proposal.reason : "Aucune modification proposée." } })
      return summary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
    } catch (error) {
      await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, status: "GENERATING" }, data: { status: "FAILED", reason: "La génération n’a pas abouti. Aucune publication." } })
      return routeError(error)
    }
  })
  for (const action of ["apply", "restore", "reconcile"] as const) {
    fastify.post<{ Params: { projectId: string; id: string } }>(prefix + "/corrections/:id/" + action, { preHandler: [requireRole("MEMBER")], config: mutateRate }, async request => {
      const { projectId, id } = Scope.parse(request.params), tenantId = request.tenantId
      if (!id) throw new CmsError("Proposition invalide.")
      if (request.body && (typeof request.body !== "object" || Object.keys(request.body).length)) throw new CmsError("Aucun champ de publication modifiable n’est accepté.")
      await guarded(projectId, request.userId, tenantId)
      const connection = await activeConnection(projectId, tenantId)
      const correction = await prisma.cmsCorrection.findFirst({ where: { id, tenantId, connectionId: connection.id } })
      if (!correction) throw new CmsError("Proposition introuvable.", 404)
      const remote = client(connection)
      if (action === "reconcile") {
        if (!OPERATING.includes(correction.status)) return summary(correction)
        const restoring = correction.direction === "RESTORE", operationId = correction.operationId
        if (!operationId) throw new CmsError("L’identifiant de cette opération est indisponible.", 409)
        let current
        // The connector serializes reconciliation with writes and cancels a not-yet-run operation.
        // A delayed request carrying that same operation ID can then never publish.
        try { current = await remote.reconcile(correction.resourceId, operationId) } catch (error) { return routeError(error) }
        const matches = current.seoTitle === (restoring ? correction.beforeTitle : correction.afterTitle) && current.seoDescription === (restoring ? correction.beforeDescription : correction.afterDescription)
        if (current.operationId === operationId) {
          const status = matches ? restoring ? "RESTORED" : "APPLIED" : "CONFLICT"
          await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, operationId, status: { in: OPERATING } },
            data: { status, ...(status === "APPLIED" ? { appliedRevision: current.revision } : {}) } })
          return summary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
        }
        const unchanged = current.revision === (restoring ? correction.appliedRevision : correction.beforeRevision)
        await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, operationId, status: { in: OPERATING } },
          data: { status: unchanged ? restoring ? "APPLIED" : "DRAFT" : "CONFLICT", direction: null } })
        return summary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
      }
      await writeRight(tenantId)
      const restoring = action === "restore", expectedStatus = restoring ? "APPLIED" : "DRAFT"
      if (correction.status === (restoring ? "RESTORED" : "APPLIED")) return summary(correction)
      if (correction.status !== expectedStatus) throw new CmsError("Cette opération n’est pas disponible dans son état actuel.", 409)
      const revision = restoring ? correction.appliedRevision : correction.beforeRevision
      if (!revision) throw new CmsError("La version de sauvegarde est indisponible.", 409)
      const operationId = randomUUID()
      const operatingStatus = restoring ? "RESTORING" : "APPLYING"
      const finish = async (data: Prisma.CmsCorrectionUpdateManyMutationInput) => {
        await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, operationId, status: operatingStatus }, data })
        return summary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
      }
      await prisma.$transaction(async tx => {
        await lockConnection(tx, connection.id, tenantId)
        await accessAtExecution(tx, tenantId, request.userId, projectId)
        if ((await tx.cmsConnection.findUniqueOrThrow({ where: { id: connection.id } })).disconnectedAt) throw new CmsError("La connexion a été remplacée.", 409)
        if (await tx.cmsCorrection.count({ where: { connectionId: connection.id, tenantId, status: { in: OPERATING } } })) throw new CmsError("Une publication attend sa confirmation. Vérifiez-la d’abord.", 409)
        const updated = await tx.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, status: expectedStatus },
          data: { status: restoring ? "RESTORING" : "APPLYING", direction: restoring ? "RESTORE" : "APPLY", operationId } })
        if (updated.count !== 1) throw new CmsError("Cette opération a déjà été prise en charge.", 409)
      })
      const desiredTitle = restoring ? correction.beforeTitle : correction.afterTitle, desiredDescription = restoring ? correction.beforeDescription : correction.afterDescription
      try {
        const current = await remote.read(correction.resourceId)
        if (current.revision !== revision) throw new CmsError("Le contenu a changé depuis la proposition. Aucune écriture effectuée.", 409)
      } catch (error) {
        await finish({ status: error instanceof CmsError && error.statusCode === 409 ? "CONFLICT" : expectedStatus, direction: null })
        return routeError(error)
      }
      try {
        await remote.write(correction.resourceId, revision, operationId, desiredTitle, desiredDescription)
        const confirmed = await remote.read(correction.resourceId)
        if (confirmed.seoTitle !== desiredTitle || confirmed.seoDescription !== desiredDescription || confirmed.operationId !== operationId) throw new CmsError("La relecture du CMS ne confirme pas la publication.", 502)
        return finish({ status: restoring ? "RESTORED" : "APPLIED", ...(restoring ? {} : { appliedRevision: confirmed.revision }) })
      } catch (error) {
        await finish({ status: error instanceof CmsError && error.statusCode === 409 ? "CONFLICT" : "UNCERTAIN" })
        return routeError(error)
      }
    })
  }
}
export default cmsRoutes
