import type { FastifyPluginAsync } from "fastify"
import { createHash } from "node:crypto"
import { z } from "zod"
import { buildActionItems, buildSearchQueryInsights, compareSearchPages, correctionVerification, formatCheckTitle, normalizePageUrl, normalizeSearchQuery, searchComparisonWindows } from "@seo/shared"
import type { ActionPlan, ActionPlanCheck, ActionVerification, SeoActionItem, SearchInsights } from "@seo/shared"
import { prisma } from "../lib/prisma"
import { assertProjectOwner, requireRole } from "../lib/guards"
import { pageBelongsToProject, propertyCoversProject, searchConsoleProvider, searchConsoleWindow } from "../lib/searchConsole"
import type { SearchConsoleProvider } from "../lib/searchConsole"
import { measurementDto } from "../lib/actionMeasurement"

const Scope = z.object({ projectId: z.string().min(1).max(100) })
const Account = z.object({ googleAccountId: z.string().min(1).max(100) })
const SyncInput = Account.extend({ propertyUrl: z.string().min(1).max(2048) }).strict()
const UpdateInput = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "IMPLEMENTED", "DISMISSED"]),
  note: z.string().max(2000).optional(),
}).strict()
const InsightsQuery = z.object({
  q: z.string().trim().max(200).default(""), mode: z.enum(["all", "opportunities", "overlap"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1), limit: z.coerce.number().int().min(1).max(100).default(25),
})
const MeasureInput = z.object({ windowDays: z.union([z.literal(7), z.literal(28)]).default(28) }).strict()

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
      prisma.seoAction.findMany({ where: { projectId, tenantId }, include: { measurements: { where: { tenantId }, orderBy: { measuredAt: "desc" }, take: 2 } } }),
    ])
    const stale = snapshot ? Date.now() - snapshot.importedAt.getTime() > 35 * 86_400_000 : false
    const actions = buildActionItems(audit ? await auditChecks(audit.id, tenantId) : [], stale ? [] : snapshot?.pages ?? [])
    for (const record of records) {
      const measurement = record.measurements.find(item => item.implementedAt.getTime() === record.implementedAt?.getTime())
      let action = actions.find(item => item.checkName === record.checkName)
      if (!action) { action = noLongerFailingAction(record); actions.push(action) }
      Object.assign(action, {
        status: record.status, note: record.note, implementedAt: record.implementedAt?.toISOString() ?? null,
        verifiedAt: record.verifiedAt?.toISOString() ?? null, verifiedAuditId: record.verifiedAuditId,
        measurement: measurement ? measurementDto(measurement) : null,
      })
      if (record.status === "VERIFIED" && action.affectedPages > 0) action.reason = `Régression détectée dans le dernier audit. ${action.reason}`
      else if (record.status === "VERIFIED") action.reason = "Correction confirmée par l’audit de preuve enregistré. Les pages omises dans un audit ultérieur ne sont pas revalidées."
    }
    const result: ActionPlan = {
      audit: audit ? { id: audit.id, completedAt: audit.completedAt?.toISOString() ?? null, pageCount: audit._count.pages } : null,
      searchConsole: snapshot ? { propertyUrl: snapshot.propertyUrl, googleAccountId: snapshot.googleAccountId, importedAt: snapshot.importedAt.toISOString(),
        startDate: snapshot.startDate, endDate: snapshot.endDate, pageCount: snapshot.pages.length, rowLimitReached: snapshot.rowLimitReached,
        queriesIncluded: snapshot.queriesIncluded, queryRowLimitReached: snapshot.queryRowLimitReached, stale } : null,
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
      const [imported, queries] = await Promise.all([
        provider.fetchPages(tenantId, googleAccountId, propertyUrl, window.startDate, window.endDate),
        provider.fetchQueryPages(tenantId, googleAccountId, propertyUrl, window.startDate, window.endDate),
      ])
      const pages = [...new Map(imported.pages.filter(page => pageBelongsToProject(page.pageUrl, project.domain)).map(page => [page.pageUrl, page])).values()]
      const queryPages = [...new Map(queries.pages.filter(page => pageBelongsToProject(page.pageUrl, project.domain)).map(page => {
        const query = page.query.trim()
        const rowKey = createHash("sha256").update(query).update("\0").update(page.pageUrl).digest("hex")
        return [rowKey, { ...page, query, rowKey }] as const
      })).values()]
      const snapshot = await prisma.$transaction(async tx => {
        const validLease = await tx.project.updateMany({ where: { id: projectId, tenantId, deletedAt: null, gscSyncStartedAt: lease }, data: { gscSyncStartedAt: null } })
        if (!validLease.count) throw new Error("Import lease expired")
        const result = await tx.searchConsoleSnapshot.create({ data: { tenantId, projectId, googleAccountId, propertyUrl, ...window,
          rowLimitReached: imported.rowLimitReached, queriesIncluded: true, queryRowLimitReached: queries.rowLimitReached } })
        for (let offset = 0; offset < pages.length; offset += 1000) {
          await tx.searchConsolePageMetric.createMany({ data: pages.slice(offset, offset + 1000).map(page => ({ tenantId, snapshotId: result.id, ...page })) })
        }
        for (let offset = 0; offset < queryPages.length; offset += 1000) {
          await tx.searchConsoleQueryMetric.createMany({ data: queryPages.slice(offset, offset + 1000).map(page => ({ tenantId, snapshotId: result.id, ...page })) })
        }
        const previous = await tx.searchConsoleSnapshot.findMany({ where: { tenantId, projectId }, orderBy: { importedAt: "desc" }, skip: 12, select: { id: true } })
        if (previous.length) await tx.searchConsoleSnapshot.deleteMany({ where: { tenantId, projectId, id: { in: previous.map(item => item.id) } } })
        return result
      }, { timeout: 30_000 })
      return reply.send({ importedAt: snapshot.importedAt.toISOString(), pageCount: pages.length, queryRowCount: queryPages.length, rowLimitReached: imported.rowLimitReached, queryRowLimitReached: queries.rowLimitReached })
    } catch {
      return reply.status(502).send({ error: "L’import Search Console a échoué. Les dernières données enregistrées sont conservées." })
    } finally {
      await prisma.project.updateMany({ where: { id: projectId, tenantId, gscSyncStartedAt: lease }, data: { gscSyncStartedAt: null } })
    }
  })

  fastify.get<{ Params: { projectId: string } }>("/api/projects/:projectId/search-insights", async (request, reply) => {
    const parsed = InsightsQuery.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: "Filtres de requêtes invalides" })
    const snapshot = await prisma.searchConsoleSnapshot.findFirst({
      where: { tenantId: request.tenantId, projectId: request.params.projectId }, orderBy: { importedAt: "desc" },
      include: { queryPages: { where: { tenantId: request.tenantId }, select: { query: true, pageUrl: true, clicks: true, impressions: true, ctr: true, position: true } } },
    })
    const items = buildSearchQueryInsights(snapshot?.queryPages ?? [])
    const { mode, q, limit } = parsed.data
    const search = normalizeSearchQuery(q)
    const filtered = items.filter(item => (!search || item.query.includes(search)) && (mode === "all" || (mode === "opportunities" ? item.opportunity !== null : item.overlap !== null)))
    if (mode === "opportunities") filtered.sort((a, b) => (b.opportunity?.signalScore ?? 0) - (a.opportunity?.signalScore ?? 0))
    const pageCount = Math.max(1, Math.ceil(filtered.length / limit))
    const page = Math.min(parsed.data.page, pageCount)
    const result: SearchInsights = {
      snapshot: snapshot ? { propertyUrl: snapshot.propertyUrl, startDate: snapshot.startDate, endDate: snapshot.endDate, importedAt: snapshot.importedAt.toISOString(),
        queriesIncluded: snapshot.queriesIncluded, rowLimitReached: snapshot.queryRowLimitReached, stale: Date.now() - snapshot.importedAt.getTime() > 35 * 86400_000 } : null,
      summary: { queryCount: items.length, opportunityCount: items.filter(item => item.opportunity).length, overlapCount: items.filter(item => item.overlap).length },
      items: filtered.slice((page - 1) * limit, page * limit), page, pageCount, total: filtered.length,
    }
    return reply.send(result)
  })

  fastify.post<{ Params: { projectId: string; checkName: string } }>("/api/projects/:projectId/action-plan/:checkName/measure", {
    preHandler: requireRole("MEMBER"), config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const parsed = MeasureInput.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: "Choisissez une période de 7 ou 28 jours" })
    const { projectId, checkName } = request.params
    const tenantId = request.tenantId
    const [action, snapshot, project] = await Promise.all([
      prisma.seoAction.findFirst({ where: { projectId, tenantId, checkName } }),
      prisma.searchConsoleSnapshot.findFirst({ where: { projectId, tenantId }, orderBy: { importedAt: "desc" } }),
      assertProjectOwner(projectId, request.userId, tenantId),
    ])
    if (!action || !action.implementedAt || !["IMPLEMENTED", "VERIFIED"].includes(action.status) || !action.expectedPageUrls.length) {
      return reply.status(409).send({ error: "Déclarez d’abord la correction effectuée sur ses pages de référence." })
    }
    const windows = searchComparisonWindows(action.implementedAt, parsed.data.windowDays)
    if (!windows.ready) return reply.status(409).send({ error: `La période après correction sera disponible à partir du ${windows.readyOn.split("-").reverse().join("/")}.`, readyOn: windows.readyOn })
    if (!snapshot || !project || !propertyCoversProject(snapshot.propertyUrl, project.domain)) {
      return reply.status(409).send({ error: "Importez d’abord Search Console pour ce projet afin de choisir une propriété autorisée." })
    }
    const lease = new Date()
    const acquired = await prisma.project.updateMany({ where: { id: projectId, tenantId, userId: request.userId, deletedAt: null,
      OR: [{ gscSyncStartedAt: null }, { gscSyncStartedAt: { lt: new Date(lease.getTime() - 180_000) } }] }, data: { gscSyncStartedAt: lease } })
    if (!acquired.count) return reply.status(409).send({ error: "Une opération Search Console est déjà en cours sur ce projet." })
    try {
      const properties = await provider.listProperties(tenantId, snapshot.googleAccountId)
      if (!properties.some(property => property.siteUrl === snapshot.propertyUrl && property.permissionLevel !== "siteUnverifiedUser")) {
        return reply.status(403).send({ error: "Accès Google refusé à la propriété de référence." })
      }
      const [before, after] = await Promise.all([
        provider.fetchPages(tenantId, snapshot.googleAccountId, snapshot.propertyUrl, windows.beforeStartDate, windows.beforeEndDate),
        provider.fetchPages(tenantId, snapshot.googleAccountId, snapshot.propertyUrl, windows.afterStartDate, windows.afterEndDate),
      ])
      const result = compareSearchPages(action.expectedPageUrls,
        before.pages.filter(page => pageBelongsToProject(page.pageUrl, project.domain)), after.pages.filter(page => pageBelongsToProject(page.pageUrl, project.domain)))
      const persistedResult = { ...result, before: result.before ? { ...result.before } : null, after: result.after ? { ...result.after } : null, changes: result.changes ? { ...result.changes } : null }
      const measurement = await prisma.$transaction(async tx => {
        const validLease = await tx.project.updateMany({ where: { id: projectId, tenantId, deletedAt: null, gscSyncStartedAt: lease }, data: { gscSyncStartedAt: null } })
        if (!validLease.count) throw new Error("Import lease expired")
        // Serialize against status changes while validating and saving this correction's measurement.
        await tx.$queryRaw`SELECT "id" FROM "seo_actions" WHERE "id" = ${action.id} AND "tenantId" = ${tenantId} FOR UPDATE`
        const current = await tx.seoAction.findFirst({ where: { id: action.id, tenantId, projectId, implementedAt: action.implementedAt, status: { in: ["IMPLEMENTED", "VERIFIED"] } } })
        if (!current) throw new Error("Correction baseline changed")
        const data = { tenantId, googleAccountId: snapshot.googleAccountId, propertyUrl: snapshot.propertyUrl, windowDays: windows.windowDays,
          beforeStartDate: windows.beforeStartDate, beforeEndDate: windows.beforeEndDate, afterStartDate: windows.afterStartDate, afterEndDate: windows.afterEndDate,
          result: persistedResult, rowLimitReached: before.rowLimitReached || after.rowLimitReached, measuredAt: new Date() }
        return tx.seoActionMeasurement.upsert({
          where: { actionId_implementedAt_windowDays: { actionId: action.id, implementedAt: action.implementedAt!, windowDays: windows.windowDays } },
          create: { ...data, actionId: action.id, implementedAt: action.implementedAt! }, update: data,
        })
      })
      return reply.send(measurementDto(measurement))
    } catch {
      return reply.status(502).send({ error: "La comparaison Search Console a échoué. La dernière mesure enregistrée est conservée." })
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
