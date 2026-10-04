import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { CmsConnection, CmsCorrection, Prisma } from "@prisma/client"
import type { CmsCorrectionSummary, CmsResource, CmsTextPatch } from "@seo/shared"
import { prisma } from "./prisma"
import { assertProjectOwner } from "./guards"
import { resolveFeature } from "./features"
import { cmsAiConfigured, CmsProposal, generateCmsProposal, generateCmsTextProposal, patchSource, validatePatchProposal } from "./cmsAI"
import { executeAiRequest } from "./aiBudget"
import { CmsError, CmsTextPatchSchema, decryptCmsCredentials, decryptCmsSecret, WordPressClient } from "./cmsWordPress"
import { PrestaShopClient, PrestaShopCredentials } from "./cmsPrestaShop"

export interface CmsRouteOptions {
  enqueue?: (id: string) => Promise<void>
  clientFactory?: (siteUrl: string, credentials: { username: string; applicationPassword: string }) => WordPressClient
  prestaFactory?: (siteUrl: string, credentials: { token: string }, scope: string) => PrestaShopClient
  generate?: typeof generateCmsProposal
  generateText?: typeof generateCmsTextProposal
}
const Draft = z.object({ resourceId: z.number().int().positive().max(2147483647), kind: z.enum(["post", "page", "product", "category", "cms"]).optional(), mode: z.enum(["SEO", "SPELLING", "CONTENT", "ALT"]) }).strict()
const patches = (value: string): CmsTextPatch[] => z.array(CmsTextPatchSchema).max(8).parse(JSON.parse(value))
const matchesPatches = (resource: CmsResource, expected: CmsTextPatch[]) => expected.every(patch => resource.segments?.some(segment => segment.id === patch.id && segment.text === patch.text))
const OPERATING = ["APPLYING", "RESTORING", "UNCERTAIN"]
const monthStart = () => { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) }
const context = (connection: { id: string; tenantId: string; projectId: string; siteUrl: string; provider: string; scope: string }) =>
  JSON.stringify([connection.tenantId, connection.projectId, connection.provider, connection.id, connection.siteUrl, ...(connection.provider === "WORDPRESS" ? [] : [connection.scope])])
// SQL identifiers are fixed; all values are bound parameters.
const lockConnection = (tx: Prisma.TransactionClient, id: string, tenantId: string) =>
  tx.$queryRawUnsafe('SELECT id FROM cms_connections WHERE id = $1 AND "tenantId" = $2 FOR UPDATE', id, tenantId)
export function cmsSummary(item: CmsCorrection): CmsCorrectionSummary {
  return { id: item.id, connectionId: item.connectionId, resourceId: item.resourceId, resourceUrl: item.resourceUrl, title: item.title,
    mode: item.mode as CmsCorrectionSummary["mode"], beforeTitle: item.beforeTitle, beforeDescription: item.beforeDescription,
    beforePatches: patches(item.beforePatchesJson), afterPatches: patches(item.afterPatchesJson),
    afterTitle: item.afterTitle, afterDescription: item.afterDescription, reason: item.reason,
    status: item.status as CmsCorrectionSummary["status"], direction: item.direction as CmsCorrectionSummary["direction"], createdAt: item.createdAt.toISOString() }
}

export interface CmsActor { projectId: string; tenantId: string; userId: string }
export function createCmsService(options: CmsRouteOptions = {}) {
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

  async function generateCorrection(actor: CmsActor, input: unknown, reservedId?: string) {
    const parsed = Draft.safeParse(input)
    if (!parsed.success) throw new CmsError("Page ou mode de correction invalide.")
    const { projectId, tenantId, userId } = actor
    await guarded(projectId, userId, tenantId); await writeRight(tenantId)
    if (!await resolveFeature(tenantId, "ai")) throw new CmsError("La génération IA n’est pas incluse dans votre abonnement.", 403)
    if (!cmsAiConfigured()) throw new CmsError("La génération IA n’est pas encore activée.", 503)
    const connection = await activeConnection(projectId, tenantId)
    await prisma.$transaction(tx => accessAtExecution(tx, tenantId, userId, projectId, true))
    const kind = parsed.data.kind ?? (connection.provider === "PRESTASHOP" ? "product" : "page")
    let resource: CmsResource
    try { resource = await client(connection).read(parsed.data.resourceId, kind) } catch (error) { return routeError(error) }
    const textMode = parsed.data.mode === "CONTENT" || parsed.data.mode === "ALT" ? parsed.data.mode : null
    if (textMode && !patchSource(resource, textMode).length) throw new CmsError("Aucun extrait compatible à corriger. Mettez à jour le connecteur et vérifiez les textes disponibles.")
    if (parsed.data.mode === "SPELLING" && !resource.seoTitle && !resource.seoDescription) throw new CmsError("Aucun champ SEO géré par le connecteur à corriger. Utilisez d’abord « Améliorer mon SEO ».")
    const correction = await prisma.$transaction(async tx => {
      // Tenant lock serializes monthly reservations across all client projects.
      await tx.$queryRawUnsafe('SELECT id FROM tenants WHERE id = $1 FOR UPDATE', tenantId)
      await lockConnection(tx, connection.id, tenantId)
      if ((await tx.cmsConnection.findUniqueOrThrow({ where: { id: connection.id } })).disconnectedAt) throw new CmsError("La connexion a été remplacée.", 409)
      const config = await accessAtExecution(tx, tenantId, userId, projectId, true)
      if (reservedId) {
        const reserved = await tx.cmsCorrection.findFirst({ where: { id: reservedId, tenantId, connectionId: connection.id, resourceId: resource.id, status: "QUEUED", mode: parsed.data.mode, resourceKind: kind } })
        if (!reserved) throw new CmsError("Cette génération a déjà été prise en charge.", 409)
        return tx.cmsCorrection.update({ where: { id: reserved.id }, data: { status: "GENERATING", resourceUrl: resource.url, title: resource.title,
          resourceKind: resource.kind, beforeTitle: resource.seoTitle, beforeDescription: resource.seoDescription, beforeRevision: resource.revision } })
      }
      const used = await tx.cmsCorrection.count({ where: { tenantId, createdAt: { gte: monthStart() } } })
      if (used >= (config?.cmsMonthlyQuota ?? 0)) throw new CmsError("Quota mensuel de propositions CMS atteint.", 403)
      return tx.cmsCorrection.create({ data: { tenantId, connectionId: connection.id, resourceId: resource.id, resourceUrl: resource.url, title: resource.title,
        mode: parsed.data.mode, resourceKind: resource.kind, beforeTitle: resource.seoTitle, beforeDescription: resource.seoDescription, beforeRevision: resource.revision } })
    })
    try {
      if (textMode) {
        const proposed = options.generateText ? await options.generateText(resource, textMode, async () => {}) : await executeAiRequest(actor, "CMS", record => generateCmsTextProposal(resource, textMode, record))
        const proposal = validatePatchProposal(resource, textMode, proposed), ids = new Set(proposal.patches.map(patch => patch.id))
        const before = patchSource(resource, textMode).filter(segment => ids.has(segment.id)).map(({ id, text }) => ({ id, text }))
        await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, status: "GENERATING" }, data: { status: proposal.patches.length ? "DRAFT" : "FAILED", afterTitle: resource.seoTitle, afterDescription: resource.seoDescription,
          beforePatchesJson: JSON.stringify(before), afterPatchesJson: JSON.stringify(proposal.patches), reason: proposal.patches.length ? proposal.reason : "Aucune faute proposée dans l’extrait compatible." } })
        return cmsSummary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
      }
      if (parsed.data.mode !== "SEO" && parsed.data.mode !== "SPELLING") throw new CmsError("Mode invalide.")
      const mode = parsed.data.mode
      const proposal = CmsProposal.parse(options.generate ? await generate(resource, mode) : await executeAiRequest(actor, "CMS", record => generateCmsProposal(resource, mode, record)))
      if (connection.provider === "PRESTASHOP" && /[={}]/.test(proposal.seoTitle + proposal.seoDescription)) throw new CmsError("La proposition contient des caractères refusés par PrestaShop.", 502)
      const afterTitle = parsed.data.mode === "SPELLING" && resource.seoTitle === null ? null : proposal.seoTitle
      const afterDescription = parsed.data.mode === "SPELLING" && resource.seoDescription === null ? null : proposal.seoDescription
      const changed = afterTitle !== resource.seoTitle || afterDescription !== resource.seoDescription
      await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, status: "GENERATING" }, data: { status: changed ? "DRAFT" : "FAILED", afterTitle, afterDescription,
        reason: changed ? proposal.reason : "Aucune modification proposée." } })
      return cmsSummary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
    } catch (error) {
      await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, status: "GENERATING" }, data: { status: "FAILED", reason: "La génération n’a pas abouti. Aucune publication." } })
      return routeError(error)
    }
  }
  async function publishCorrection(actor: CmsActor, id: string, action: "apply" | "restore" | "reconcile") {
      const { projectId, tenantId, userId } = actor
      if (!id) throw new CmsError("Proposition invalide.")
      await guarded(projectId, userId, tenantId)
      const connection = await activeConnection(projectId, tenantId)
      const correction = await prisma.cmsCorrection.findFirst({ where: { id, tenantId, connectionId: connection.id } })
      if (!correction) throw new CmsError("Proposition introuvable.", 404)
      const remote = client(connection)
      if (action === "reconcile") {
        if (!OPERATING.includes(correction.status)) return cmsSummary(correction)
        const restoring = correction.direction === "RESTORE", operationId = correction.operationId
        if (!operationId) throw new CmsError("L’identifiant de cette opération est indisponible.", 409)
        let current
        // The connector serializes reconciliation with writes and cancels a not-yet-run operation.
        // A delayed request carrying that same operation ID can then never publish.
        try { current = await remote.reconcile(correction.resourceId, operationId, correction.resourceKind as CmsResource["kind"]) } catch (error) { return routeError(error) }
        const matches = current.seoTitle === (restoring ? correction.beforeTitle : correction.afterTitle) && current.seoDescription === (restoring ? correction.beforeDescription : correction.afterDescription) && matchesPatches(current, patches(restoring ? correction.beforePatchesJson : correction.afterPatchesJson))
        if (current.operationId === operationId) {
          const status = matches ? restoring ? "RESTORED" : "APPLIED" : "CONFLICT"
          await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, operationId, status: { in: OPERATING } },
            data: { status, ...(status === "APPLIED" ? { appliedRevision: current.revision } : {}) } })
          return cmsSummary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
        }
        const unchanged = current.revision === (restoring ? correction.appliedRevision : correction.beforeRevision)
        await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, operationId, status: { in: OPERATING } },
          data: { status: unchanged ? restoring ? "APPLIED" : "DRAFT" : "CONFLICT", direction: null } })
        return cmsSummary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
      }
      await writeRight(tenantId)
      const restoring = action === "restore", expectedStatus = restoring ? "APPLIED" : "DRAFT"
      if (correction.status === (restoring ? "RESTORED" : "APPLIED")) return cmsSummary(correction)
      if (correction.status !== expectedStatus) throw new CmsError("Cette opération n’est pas disponible dans son état actuel.", 409)
      const revision = restoring ? correction.appliedRevision : correction.beforeRevision
      if (!revision) throw new CmsError("La version de sauvegarde est indisponible.", 409)
      const operationId = randomUUID()
      const operatingStatus = restoring ? "RESTORING" : "APPLYING"
      const finish = async (data: Prisma.CmsCorrectionUpdateManyMutationInput) => {
        await prisma.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, operationId, status: operatingStatus }, data })
        return cmsSummary(await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: correction.id } }))
      }
      await prisma.$transaction(async tx => {
        await lockConnection(tx, connection.id, tenantId)
        await accessAtExecution(tx, tenantId, userId, projectId)
        if ((await tx.cmsConnection.findUniqueOrThrow({ where: { id: connection.id } })).disconnectedAt) throw new CmsError("La connexion a été remplacée.", 409)
        if (await tx.cmsCorrection.count({ where: { connectionId: connection.id, tenantId, status: { in: OPERATING } } })) throw new CmsError("Une publication attend sa confirmation. Vérifiez-la d’abord.", 409)
        const updated = await tx.cmsCorrection.updateMany({ where: { id: correction.id, tenantId, status: expectedStatus },
          data: { status: restoring ? "RESTORING" : "APPLYING", direction: restoring ? "RESTORE" : "APPLY", operationId } })
        if (updated.count !== 1) throw new CmsError("Cette opération a déjà été prise en charge.", 409)
      })
      const desiredTitle = restoring ? correction.beforeTitle : correction.afterTitle, desiredDescription = restoring ? correction.beforeDescription : correction.afterDescription
      const desiredPatches = patches(restoring ? correction.beforePatchesJson : correction.afterPatchesJson)
      try {
        const current = await remote.read(correction.resourceId, correction.resourceKind as CmsResource["kind"])
        if (current.revision !== revision) throw new CmsError("Le contenu a changé depuis la proposition. Aucune écriture effectuée.", 409)
      } catch (error) {
        await finish({ status: error instanceof CmsError && error.statusCode === 409 ? "CONFLICT" : expectedStatus, direction: null })
        return routeError(error)
      }
      try {
        await remote.write(correction.resourceId, revision, operationId, desiredTitle, desiredDescription, correction.resourceKind as CmsResource["kind"], desiredPatches)
        const confirmed = await remote.read(correction.resourceId, correction.resourceKind as CmsResource["kind"])
        if (confirmed.seoTitle !== desiredTitle || confirmed.seoDescription !== desiredDescription || confirmed.operationId !== operationId || !matchesPatches(confirmed, desiredPatches)) throw new CmsError("La relecture du CMS ne confirme pas la publication.", 502)
        return finish({ status: restoring ? "RESTORED" : "APPLIED", ...(restoring ? {} : { appliedRevision: confirmed.revision }) })
      } catch (error) {
        await finish({ status: error instanceof CmsError && error.statusCode === 409 ? "CONFLICT" : "UNCERTAIN" })
        return routeError(error)
      }
  }
  return { factory, prestaFactory, client, guarded, activeConnection, quota, writeRight, accessAtExecution, routeError, generateCorrection, publishCorrection }
}
