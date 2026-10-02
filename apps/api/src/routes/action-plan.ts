import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { buildActionItems, correctionVerification, formatCheckTitle, normalizePageUrl } from "@seo/shared"
import type { ActionPlan, ActionPlanCheck, ActionVerification, SeoActionItem } from "@seo/shared"
import { prisma } from "../lib/prisma"
import { assertProjectOwner, requireRole } from "../lib/guards"
import { pageBelongsToProject, propertyCoversProject, searchConsoleProvider, searchConsoleWindow } from "../lib/searchConsole"
import type { SearchConsoleProvider } from "../lib/searchConsole"

const Scope = z.object({ projectId: z.string().min(1).max(100) })
const Account = z.object({ googleAccountId: z.string().min(1).max(100) })
const SyncInput = Account.extend({ propertyUrl: z.string().min(1).max(2048) }).strict()
const UpdateInput = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "IMPLEMENTED", "DISMISSED"]),
  note: z.string().max(2000).optional(),
}).strict()

async function latestAudit(projectId: string, tenantId: string, userId: string) {
  return prisma.audit.findFirst({
    where: { projectId, tenantId, userId, deletedAt: null, status: "COMPLETED" },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, createdAt: true, completedAt: true, _count: { select: { pages: true } } },
  })
}

async function auditChecks(auditId: string, tenantId: string): Promise<ActionPlanCheck[]> {
  const checks = await prisma.pageResult.findMany({
    where: { tenantId, page: { auditId, tenantId } },
    select: { checkName: true, category: true, priority: true, effort: true, status: true, value: true, expected: true, message: true, page: { select: { url: true } } },
  })
  return checks.map(({ page, ...check }) => ({ ...check, pageUrl: page.url }))
}

function noLongerFailingAction(record: { checkName: string }): SeoActionItem {
  return { checkName: record.checkName, title: formatCheckTitle(record.checkName), category: "TECHNICAL", priority: "LOW", effort: "LOW", priorityScore: 0,
    reason: "Ce problème n’apparaît plus parmi les échecs du dernier audit. Une vérification de toutes les pages de référence reste nécessaire.", confidence: "AUDIT_ONLY", affectedPages: 0,
    failCount: 0, warnCount: 0, evidence: [], search: null, status: "OPEN", note: "", implementedAt: null, verifiedAt: null, verifiedAuditId: null }
}

interface ActionPlanOptions { provider?: SearchConsoleProvider }

const actionPlanRoutes: FastifyPluginAsync<ActionPlanOptions> = async (fastify, options) => {
  const provider = options.provider ?? searchConsoleProvider
  // All endpoints enforce both tenant and project owner, even when a guessed project ID exists.
  fastify.addHook("preHandler", async (request, reply) => {
    const parsed = Scope.safeParse(request.params)
    if (!parsed.success) return reply.status(400).send({ error: "Projet invalide" })
    if (!await assertProjectOwner(parsed.data.projectId, request.userId, request.tenantId)) {
      return reply.status(404).send({ error: "Projet introuvable" })
    }
  })

  fastify.get<{ Params: { projectId: string } }>("/api/projects/:projectId/action-plan", async (request, reply) => {
    const { projectId } = request.params
    const tenantId = request.tenantId
    const [audit, snapshot, records] = await Promise.all([
      latestAudit(projectId, tenantId, request.userId),
      prisma.searchConsoleSnapshot.findFirst({ where: { projectId, tenantId }, orderBy: { importedAt: "desc" }, include: { pages: true } }),
      prisma.seoAction.findMany({ where: { projectId, tenantId } }),
    ])
    const stale = snapshot ? Date.now() - snapshot.importedAt.getTime() > 35 * 86_400_000 : false
    const actions = buildActionItems(audit ? await auditChecks(audit.id, tenantId) : [], stale ? [] : snapshot?.pages ?? [])
    for (const record of records) {
      let action = actions.find(item => item.checkName === record.checkName)
      if (!action) { action = noLongerFailingAction(record); actions.push(action) }
      Object.assign(action, {
        status: record.status, note: record.note, implementedAt: record.implementedAt?.toISOString() ?? null,
        verifiedAt: record.verifiedAt?.toISOString() ?? null, verifiedAuditId: record.verifiedAuditId,
      })
      if (record.status === "VERIFIED" && action.affectedPages > 0) action.reason = `Régression détectée dans le dernier audit. ${action.reason}`
      else if (record.status === "VERIFIED") action.reason = "Correction confirmée par l’audit de preuve enregistré. Les pages omises dans un audit ultérieur ne sont pas revalidées."
    }
    const result: ActionPlan = {
      audit: audit ? { id: audit.id, completedAt: audit.completedAt?.toISOString() ?? null, pageCount: audit._count.pages } : null,
      searchConsole: snapshot ? { propertyUrl: snapshot.propertyUrl, googleAccountId: snapshot.googleAccountId, importedAt: snapshot.importedAt.toISOString(),
        startDate: snapshot.startDate, endDate: snapshot.endDate, pageCount: snapshot.pages.length, rowLimitReached: snapshot.rowLimitReached, stale } : null,
      actions,
    }
    return reply.send(result)
  })

  fastify.get<{ Params: { projectId: string } }>("/api/projects/:projectId/search-console/properties", async (request, reply) => {
    const query = Account.safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: "Compte Google requis" })
    const account = await prisma.googleAccount.findFirst({ where: { id: query.data.googleAccountId, tenantId: request.tenantId }, select: { id: true, scopes: true } })
    if (!account || !account.scopes.some(scope => scope === "https://www.googleapis.com/auth/webmasters.readonly" || scope === "https://www.googleapis.com/auth/webmasters")) {
      return reply.status(400).send({ error: "Connectez un compte Google avec l’accès Search Console dans les paramètres." })
    }
    const project = await assertProjectOwner(request.params.projectId, request.userId, request.tenantId)
    try {
      const properties = await provider.listProperties(request.tenantId, account.id)
      return reply.send({ properties: properties.filter(property => propertyCoversProject(property.siteUrl, project!.domain)) })
    } catch {
      return reply.status(502).send({ error: "Impossible de lire les propriétés Search Console. Vérifiez les droits et reconnectez le compte Google si nécessaire." })
    }
  })

  fastify.post<{ Params: { projectId: string } }>("/api/projects/:projectId/search-console/sync", {
    preHandler: requireRole("MEMBER"), config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const parsed = SyncInput.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: "Propriété ou compte Google invalide" })
    const { googleAccountId, propertyUrl } = parsed.data
    const tenantId = request.tenantId
    const projectId = request.params.projectId
    const project = await assertProjectOwner(projectId, request.userId, tenantId)
    const account = await prisma.googleAccount.findFirst({ where: { id: googleAccountId, tenantId }, select: { scopes: true } })
    if (!project || !account || !propertyCoversProject(propertyUrl, project.domain)
      || !account.scopes.some(scope => scope === "https://www.googleapis.com/auth/webmasters.readonly" || scope === "https://www.googleapis.com/auth/webmasters")) {
      return reply.status(400).send({ error: "Cette propriété Search Console ne correspond pas au projet ou le compte n’a pas les droits requis." })
    }
    const lease = new Date()
    const acquired = await prisma.project.updateMany({
      where: { id: projectId, tenantId, userId: request.userId, deletedAt: null,
        OR: [{ gscSyncStartedAt: null }, { gscSyncStartedAt: { lt: new Date(lease.getTime() - 180_000) } }] },
      data: { gscSyncStartedAt: lease },
    })
    if (!acquired.count) return reply.status(409).send({ error: "Un import est déjà en cours. Réessayez dans quelques instants." })
    try {
      const properties = await provider.listProperties(tenantId, googleAccountId)
      if (!properties.some(property => property.siteUrl === propertyUrl && property.permissionLevel !== "siteUnverifiedUser")) {
        return reply.status(403).send({ error: "Accès Google refusé à cette propriété." })
      }
      const window = searchConsoleWindow()
      const imported = await provider.fetchPages(tenantId, googleAccountId, propertyUrl, window.startDate, window.endDate)
      const pages = [...new Map(imported.pages.filter(page => pageBelongsToProject(page.pageUrl, project.domain)).map(page => [page.pageUrl, page])).values()]
      const snapshot = await prisma.$transaction(async tx => {
        const validLease = await tx.project.updateMany({ where: { id: projectId, tenantId, deletedAt: null, gscSyncStartedAt: lease }, data: { gscSyncStartedAt: null } })
        if (!validLease.count) throw new Error("Import lease expired")
        const result = await tx.searchConsoleSnapshot.create({ data: { tenantId, projectId, googleAccountId, propertyUrl, ...window, rowLimitReached: imported.rowLimitReached } })
        for (let offset = 0; offset < pages.length; offset += 1000) {
          await tx.searchConsolePageMetric.createMany({ data: pages.slice(offset, offset + 1000).map(page => ({ tenantId, snapshotId: result.id, ...page })) })
        }
        const previous = await tx.searchConsoleSnapshot.findMany({ where: { tenantId, projectId }, orderBy: { importedAt: "desc" }, skip: 12, select: { id: true } })
        if (previous.length) await tx.searchConsoleSnapshot.deleteMany({ where: { tenantId, projectId, id: { in: previous.map(item => item.id) } } })
        return result
      }, { timeout: 30_000 })
      return reply.send({ importedAt: snapshot.importedAt.toISOString(), pageCount: pages.length, rowLimitReached: imported.rowLimitReached })
    } catch {
      return reply.status(502).send({ error: "L’import Search Console a échoué. Les dernières données enregistrées sont conservées." })
    } finally {
      await prisma.project.updateMany({ where: { id: projectId, tenantId, gscSyncStartedAt: lease }, data: { gscSyncStartedAt: null } })
    }
  })

  fastify.patch<{ Params: { projectId: string; checkName: string } }>("/api/projects/:projectId/action-plan/:checkName", { preHandler: requireRole("MEMBER") }, async (request, reply) => {
    const parsed = UpdateInput.safeParse(request.body)
    const checkName = request.params.checkName
    if (!parsed.success || !/^[a-zA-Z0-9_-]{1,100}$/.test(checkName)) return reply.status(400).send({ error: "Action invalide" })
    const { projectId } = request.params
    const tenantId = request.tenantId
    const audit = await latestAudit(projectId, tenantId, request.userId)
    const checks = audit ? await auditChecks(audit.id, tenantId) : []
    const existing = await prisma.seoAction.findFirst({ where: { projectId, tenantId, checkName } })
    const affected = checks.filter(check => check.checkName === checkName && check.status !== "PASS")
    if (!affected.length && !existing) return reply.status(404).send({ error: "Action introuvable dans le dernier audit" })
    if (parsed.data.status === "IMPLEMENTED" && !affected.length) return reply.status(409).send({ error: "Cette action n’a plus de problème actif. Vérifiez les corrections existantes." })
    const data = {
      status: parsed.data.status, ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
      implementedAt: parsed.data.status === "IMPLEMENTED" ? existing?.status === "IMPLEMENTED" ? existing.implementedAt : new Date() : null,
      baselineAuditId: parsed.data.status === "IMPLEMENTED" ? existing?.status === "IMPLEMENTED" ? existing.baselineAuditId : audit!.id : null,
      expectedPageUrls: parsed.data.status === "IMPLEMENTED" ? existing?.status === "IMPLEMENTED" ? existing.expectedPageUrls : [...new Set(affected.flatMap(check => { const url = normalizePageUrl(check.pageUrl); return url ? [url] : [] }))] : [],
      verifiedAt: null, verifiedAuditId: null,
    }
    const action = await prisma.seoAction.upsert({
      where: { projectId_checkName: { projectId, checkName } },
      create: { tenantId, projectId, checkName, ...data }, update: data,
    })
    return reply.send({ status: action.status, note: action.note })
  })

  fastify.post<{ Params: { projectId: string } }>("/api/projects/:projectId/action-plan/verify", { preHandler: requireRole("MEMBER") }, async (request, reply) => {
    const { projectId } = request.params
    const tenantId = request.tenantId
    const [audit, actions] = await Promise.all([
      latestAudit(projectId, tenantId, request.userId),
      prisma.seoAction.findMany({ where: { projectId, tenantId, status: { in: ["IMPLEMENTED", "VERIFIED"] } } }),
    ])
    const checks = audit ? await auditChecks(audit.id, tenantId) : []
    const result: ActionVerification = { verified: [], pending: [], reopened: [] }
    await prisma.$transaction(async tx => {
      for (const action of actions) {
        if (action.status === "VERIFIED") {
          if (audit && audit.id !== action.verifiedAuditId && checks.some(check => check.checkName === action.checkName && check.status !== "PASS")) {
            const reopened = await tx.seoAction.updateMany({ where: { id: action.id, tenantId, projectId, status: "VERIFIED", updatedAt: action.updatedAt }, data: { status: "OPEN", verifiedAt: null, verifiedAuditId: null } })
            if (reopened.count) result.reopened.push(action.checkName)
          }
          continue
        }
        const reason = !audit || !action.implementedAt || audit.id === action.baselineAuditId || audit.createdAt <= action.implementedAt
          ? "Relancez un audit après avoir indiqué la correction comme effectuée."
          : correctionVerification(action.checkName, action.expectedPageUrls, checks)
        if (reason) { result.pending.push({ checkName: action.checkName, reason }); continue }
        const updated = await tx.seoAction.updateMany({ where: { id: action.id, tenantId, projectId, status: "IMPLEMENTED", updatedAt: action.updatedAt },
          data: { status: "VERIFIED", verifiedAt: new Date(), verifiedAuditId: audit!.id } })
        if (updated.count) result.verified.push(action.checkName)
      }
    })
    return reply.send(result)
  })
}

export default actionPlanRoutes
