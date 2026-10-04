import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { analyticsExposure, analyticsPageUrl, compareAnalyticsPages, googleCalendarDate, mergeAnalyticsQuality, searchComparisonWindows, shiftCalendarDate, summarizeAnalytics } from "@seo/shared"
import type { ProjectAnalytics } from "@seo/shared"
import { prisma } from "../lib/prisma"
import { assertProjectOwner, requireRole } from "../lib/guards"
import { analyticsProvider, AnalyticsPropertySchema, AnalyticsQualitySchema, matchingAnalyticsStreams } from "../lib/analytics"
import type { AnalyticsProvider } from "../lib/analytics"
import { analyticsMeasurementDto } from "../lib/analyticsMeasurement"
import { pageBelongsToProject } from "../lib/searchConsole"

const Account = z.object({ googleAccountId: z.string().min(1).max(100), propertyId: z.string().regex(/^properties\/[0-9]{1,20}$/) }).strict()
const Sync = Account.extend({ streamId: z.string().regex(/^[0-9]{1,20}$/) }).strict()
const Paging = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) })
const Window = z.object({ windowDays: z.union([z.literal(7), z.literal(28)]).default(28) }).strict()
const scopeAllowed = (scopes: string[]) => scopes.some(scope => scope === "https://www.googleapis.com/auth/analytics.readonly" || scope === "https://www.googleapis.com/auth/analytics.edit")

const analyticsRoutes: FastifyPluginAsync<{ provider?: AnalyticsProvider }> = async (fastify, options) => {
  const provider = options.provider ?? analyticsProvider
  fastify.addHook("preHandler", async (request, reply) => {
    const projectId = (request.params as { projectId?: string }).projectId
    if (!projectId || projectId.length > 100 || !await assertProjectOwner(projectId, request.userId, request.tenantId)) return reply.status(404).send({ error: "Projet introuvable" })
  })

  fastify.get<{ Params: { projectId: string } }>("/api/projects/:projectId/analytics/property", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (request, reply) => {
    const parsed = Account.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: "Compte et identifiant GA4 requis (properties/123456789)." })
    const account = await prisma.googleAccount.findFirst({ where: { id: parsed.data.googleAccountId, tenantId: request.tenantId }, select: { scopes: true } })
    if (!account || !scopeAllowed(account.scopes)) return reply.status(400).send({ error: "Connectez un compte Google avec l’accès Analytics." })
    const project = await assertProjectOwner(request.params.projectId, request.userId, request.tenantId)
    try {
      const property = AnalyticsPropertySchema.parse(await provider.getProperty(request.tenantId, parsed.data.googleAccountId, parsed.data.propertyId))
      return reply.send({ ...property, streams: matchingAnalyticsStreams(property, project!.domain) })
    } catch { return reply.status(502).send({ error: "Impossible de vérifier la propriété GA4. Vérifiez l’identifiant, les droits Google et l’activation de Google Analytics Admin API." }) }
  })

  fastify.get<{ Params: { projectId: string } }>("/api/projects/:projectId/analytics", async (request, reply) => {
    const paging = Paging.safeParse(request.query)
    if (!paging.success) return reply.status(400).send({ error: "Page invalide" })
    const { projectId } = request.params; const tenantId = request.tenantId
    const [snapshot, actions, audit] = await Promise.all([
      prisma.analyticsSnapshot.findFirst({ where: { projectId, tenantId }, orderBy: { importedAt: "desc" }, include: { pages: { where: { tenantId } } } }),
      prisma.seoAction.findMany({ where: { projectId, tenantId }, include: { analyticsMeasurements: { where: { tenantId }, orderBy: { measuredAt: "desc" }, take: 2 } } }),
      prisma.audit.findFirst({ where: { projectId, tenantId, userId: request.userId, deletedAt: null, status: "COMPLETED" }, orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }], select: { id: true } }),
    ])
    const failures = audit ? await prisma.pageResult.findMany({ where: { tenantId, page: { tenantId, auditId: audit.id }, status: { not: "PASS" } }, select: { checkName: true, page: { select: { url: true } } } }) : []
    const byCheck = new Map<string, string[]>()
    for (const failure of failures) { const urls = byCheck.get(failure.checkName) ?? []; urls.push(failure.page.url); byCheck.set(failure.checkName, urls) }
    for (const action of actions) if (["IMPLEMENTED", "VERIFIED"].includes(action.status) || !byCheck.has(action.checkName)) byCheck.set(action.checkName, action.expectedPageUrls)
    const quality = snapshot ? AnalyticsQualitySchema.parse(snapshot.quality) : null
    const stale = !!snapshot && Date.now() - snapshot.importedAt.getTime() > 35 * 86400_000
    const pages = (snapshot?.pages ?? []).map(({ pageUrl, sessions, keyEvents, purchaseRevenue }) => ({ pageUrl, sessions, keyEvents, purchaseRevenue }))
      .sort((a, b) => b.keyEvents - a.keyEvents || b.sessions - a.sessions || a.pageUrl.localeCompare(b.pageUrl))
    const pageCount = Math.max(1, Math.ceil(pages.length / 25)); const page = Math.min(paging.data.page, pageCount)
    const result: ProjectAnalytics = {
      snapshot: snapshot && quality ? { ...quality, id: snapshot.id, googleAccountId: snapshot.googleAccountId, propertyId: snapshot.propertyId, displayName: snapshot.displayName,
        streamId: snapshot.streamId, timeZone: snapshot.timeZone, currencyCode: snapshot.currencyCode, startDate: snapshot.startDate, endDate: snapshot.endDate, importedAt: snapshot.importedAt.toISOString(), stale } : null,
      summary: snapshot && pages.length ? { ...summarizeAnalytics(pages), ...(quality?.revenueRestricted ? { purchaseRevenue: null } : {}) } : null,
      pages: pages.slice((page - 1) * 25, page * 25), page, pageCount, total: pages.length,
      actions: [...byCheck].map(([checkName, urls]) => {
        const record = actions.find(action => action.checkName === checkName)
        const stored = record?.analyticsMeasurements.find(item => item.implementedAt.getTime() === record.implementedAt?.getTime())
        const exposure = analyticsExposure(urls, pages)
        return { checkName, exposure: exposure && snapshot ? { ...exposure, currencyCode: snapshot.currencyCode, stale } : null,
          measurement: stored && record && ["IMPLEMENTED", "VERIFIED"].includes(record.status) ? analyticsMeasurementDto(stored) : null }
      }),
    }
    return reply.send(result)
  })

  fastify.post<{ Params: { projectId: string } }>("/api/projects/:projectId/analytics/sync", { preHandler: requireRole("MEMBER"), config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (request, reply) => {
    const parsed = Sync.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: "Compte, propriété ou flux GA4 invalide." })
    const { projectId } = request.params; const tenantId = request.tenantId
    const account = await prisma.googleAccount.findFirst({ where: { id: parsed.data.googleAccountId, tenantId }, select: { scopes: true } })
    if (!account || !scopeAllowed(account.scopes)) return reply.status(400).send({ error: "Ce compte Google n’a pas les droits Analytics." })
    const project = await assertProjectOwner(projectId, request.userId, tenantId)
    const lease = new Date()
    const acquired = await prisma.project.updateMany({ where: { id: projectId, tenantId, userId: request.userId, deletedAt: null,
      OR: [{ analyticsSyncStartedAt: null }, { analyticsSyncStartedAt: { lt: new Date(lease.getTime() - 180_000) } }] }, data: { analyticsSyncStartedAt: lease } })
    if (!acquired.count) return reply.status(409).send({ error: "Une opération GA4 est déjà en cours sur ce projet." })
    try {
      const { googleAccountId, propertyId, streamId } = parsed.data
      const property = AnalyticsPropertySchema.parse(await provider.getProperty(tenantId, googleAccountId, propertyId))
      if (property.propertyId !== propertyId || !matchingAnalyticsStreams(property, project!.domain).some(stream => stream.id === streamId)) return reply.status(400).send({ error: "Le flux web GA4 ne couvre pas le domaine de ce projet." })
      const endDate = shiftCalendarDate(googleCalendarDate(new Date(), property.timeZone), -3); const startDate = shiftCalendarDate(endDate, -27)
      const imported = await provider.fetchPages(tenantId, googleAccountId, property, streamId, project!.domain, startDate, endDate)
      const pages = imported.pages.filter(page => pageBelongsToProject(page.pageUrl, project!.domain)).map(page => ({ ...page, pageUrl: analyticsPageUrl(page.pageUrl)! }))
      const snapshot = await prisma.$transaction(async tx => {
        const valid = await tx.project.updateMany({ where: { id: projectId, tenantId, deletedAt: null, analyticsSyncStartedAt: lease }, data: { analyticsSyncStartedAt: null } })
        if (!valid.count) throw new Error("GA4 lease changed")
        const saved = await tx.analyticsSnapshot.create({ data: { tenantId, projectId, googleAccountId, propertyId, displayName: property.displayName, streamId,
          currencyCode: property.currencyCode, timeZone: property.timeZone, startDate, endDate, quality: { ...imported.quality } } })
        for (let offset = 0; offset < pages.length; offset += 1000) await tx.analyticsPageMetric.createMany({ data: pages.slice(offset, offset + 1000).map(page => ({ ...page, tenantId, snapshotId: saved.id })) })
        const old = await tx.analyticsSnapshot.findMany({ where: { tenantId, projectId }, orderBy: { importedAt: "desc" }, skip: 12, select: { id: true } })
        if (old.length) await tx.analyticsSnapshot.deleteMany({ where: { tenantId, projectId, id: { in: old.map(item => item.id) } } })
        return saved
      }, { timeout: 30_000 })
      return reply.send({ importedAt: snapshot.importedAt.toISOString(), pageCount: pages.length })
    } catch { return reply.status(502).send({ error: "L’import GA4 a échoué. Les dernières données sont conservées. Vérifiez aussi l’activation de Google Analytics Data API." }) }
    finally { await prisma.project.updateMany({ where: { id: projectId, tenantId, analyticsSyncStartedAt: lease }, data: { analyticsSyncStartedAt: null } }) }
  })

  fastify.post<{ Params: { projectId: string; checkName: string } }>("/api/projects/:projectId/analytics/actions/:checkName/measure", { preHandler: requireRole("MEMBER"), config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (request, reply) => {
    const parsed = Window.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: "Choisissez 7 ou 28 jours." })
    const { projectId, checkName } = request.params; const tenantId = request.tenantId
    const [snapshot, action, project] = await Promise.all([
      prisma.analyticsSnapshot.findFirst({ where: { projectId, tenantId }, orderBy: { importedAt: "desc" } }),
      prisma.seoAction.findFirst({ where: { projectId, tenantId, checkName } }), assertProjectOwner(projectId, request.userId, tenantId),
    ])
    if (!snapshot) return reply.status(409).send({ error: "Importez d’abord GA4 pour choisir la propriété et le flux." })
    if (!action?.implementedAt || !["IMPLEMENTED", "VERIFIED"].includes(action.status) || !action.expectedPageUrls.length) return reply.status(409).send({ error: "Déclarez d’abord la correction effectuée." })
    const windows = searchComparisonWindows(action.implementedAt, parsed.data.windowDays, new Date(), snapshot.timeZone)
    if (!windows.ready) return reply.status(409).send({ error: `Période après correction disponible à partir du ${windows.readyOn.split("-").reverse().join("/")}.`, readyOn: windows.readyOn })
    const account = await prisma.googleAccount.findFirst({ where: { id: snapshot.googleAccountId, tenantId }, select: { scopes: true } })
    if (!account || !scopeAllowed(account.scopes)) return reply.status(409).send({ error: "Reconnectez le compte Google avec les droits Analytics." })
    const lease = new Date()
    const acquired = await prisma.project.updateMany({ where: { id: projectId, tenantId, userId: request.userId, deletedAt: null,
      OR: [{ analyticsSyncStartedAt: null }, { analyticsSyncStartedAt: { lt: new Date(lease.getTime() - 180_000) } }] }, data: { analyticsSyncStartedAt: lease } })
    if (!acquired.count) return reply.status(409).send({ error: "Une opération GA4 est déjà en cours sur ce projet." })
    try {
      const property = AnalyticsPropertySchema.parse(await provider.getProperty(tenantId, snapshot.googleAccountId, snapshot.propertyId))
      if (property.propertyId !== snapshot.propertyId || property.timeZone !== snapshot.timeZone || property.currencyCode !== snapshot.currencyCode
        || !matchingAnalyticsStreams(property, project!.domain).some(stream => stream.id === snapshot.streamId)) return reply.status(409).send({ error: "La configuration GA4 a changé. Effectuez un nouvel import avant la comparaison." })
      const [before, after] = await Promise.all([
        provider.fetchPages(tenantId, snapshot.googleAccountId, property, snapshot.streamId, project!.domain, windows.beforeStartDate, windows.beforeEndDate),
        provider.fetchPages(tenantId, snapshot.googleAccountId, property, snapshot.streamId, project!.domain, windows.afterStartDate, windows.afterEndDate),
      ])
      const quality = mergeAnalyticsQuality(before.quality, after.quality)
      const result = compareAnalyticsPages(action.expectedPageUrls, before.pages.filter(page => pageBelongsToProject(page.pageUrl, project!.domain)), after.pages.filter(page => pageBelongsToProject(page.pageUrl, project!.domain)))
      const storedResult = { ...result, before: result.before ? { ...result.before } : null, after: result.after ? { ...result.after } : null, changes: result.changes ? { ...result.changes } : null }
      const measurement = await prisma.$transaction(async tx => {
        const valid = await tx.project.updateMany({ where: { id: projectId, tenantId, deletedAt: null, analyticsSyncStartedAt: lease }, data: { analyticsSyncStartedAt: null } })
        if (!valid.count) throw new Error("GA4 lease changed")
        await tx.$queryRaw`SELECT "id" FROM "seo_actions" WHERE "id" = ${action.id} AND "tenantId" = ${tenantId} FOR UPDATE`
        const current = await tx.seoAction.findFirst({ where: { id: action.id, tenantId, projectId, implementedAt: action.implementedAt, status: { in: ["IMPLEMENTED", "VERIFIED"] } } })
        if (!current) throw new Error("Correction baseline changed")
        const data = { tenantId, googleAccountId: snapshot.googleAccountId, propertyId: snapshot.propertyId, streamId: snapshot.streamId, timeZone: snapshot.timeZone,
          currencyCode: snapshot.currencyCode, windowDays: windows.windowDays, beforeStartDate: windows.beforeStartDate, beforeEndDate: windows.beforeEndDate,
          afterStartDate: windows.afterStartDate, afterEndDate: windows.afterEndDate, quality: { ...quality }, result: storedResult, measuredAt: new Date() }
        return tx.analyticsActionMeasurement.upsert({ where: { actionId_implementedAt_windowDays: { actionId: action.id, implementedAt: action.implementedAt!, windowDays: windows.windowDays } },
          create: { ...data, actionId: action.id, implementedAt: action.implementedAt! }, update: data })
      })
      return reply.send(analyticsMeasurementDto(measurement))
    } catch { return reply.status(502).send({ error: "La comparaison GA4 a échoué. La dernière mesure est conservée." }) }
    finally { await prisma.project.updateMany({ where: { id: projectId, tenantId, analyticsSyncStartedAt: lease }, data: { analyticsSyncStartedAt: null } }) }
  })
}
export default analyticsRoutes
