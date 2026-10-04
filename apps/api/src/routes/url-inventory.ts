import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { buildInternalLinkAnalysis, buildUrlInventory, inventoryUrls, matchesUrlInventoryMode, normalizeInternalLinkUrl, readSitemapInventory, internalLinkBelongsToProject } from "@seo/shared"
import type { ProjectUrlInventory, SitemapInventory, SitemapSyncResult, UrlInventorySearchPage } from "@seo/shared"
import { collectSitemapInventory } from "@seo/crawler"
import { isValidPublicUrl } from "@seo/shared/security"
import { prisma } from "../lib/prisma"
import { assertProjectOwner, requireRole } from "../lib/guards"
import { loadLinkingAuditPages } from "../lib/internalLinks"

const Scope = z.object({ projectId: z.string().min(1).max(100) })
const Query = z.object({ mode: z.enum(["investigate", "all", "not-crawled", "without-incoming", "linked-not-crawled", "excluded"]).default("investigate"),
  q: z.string().trim().max(200).default(""), page: z.coerce.number().int().min(1).max(1000).default(1) }).strict()
const Sync = z.object({ sitemapUrl: z.string().url().max(2048).optional() }).strict()
const stale = (value: Date) => Date.now() - value.getTime() > 35 * 86400_000

export interface UrlInventoryRouteOptions { collect?: (projectUrl: string, sitemapUrl?: string) => Promise<SitemapInventory> }

async function searchPages(snapshotId: string, tenantId: string): Promise<{ pages: UrlInventorySearchPage[]; limited: boolean }> {
  const pages: UrlInventorySearchPage[] = []
  let bytes = 0
  for (let offset = 0; offset < 10_000; offset += 250) {
    const rows = await prisma.searchConsolePageMetric.findMany({ where: { snapshotId, tenantId }, orderBy: [{ impressions: "desc" }, { pageUrl: "asc" }], skip: offset, take: 250,
      select: { pageUrl: true, clicks: true, impressions: true } })
    for (const row of rows) {
      bytes += Buffer.byteLength(JSON.stringify(row), "utf8")
      if (bytes > 4 * 1024 * 1024) return { pages, limited: true }
      pages.push(row)
    }
    if (rows.length < 250) return { pages, limited: false }
  }
  return { pages, limited: true }
}

const urlInventoryRoutes: FastifyPluginAsync<UrlInventoryRouteOptions> = async (fastify, options) => {
  const collect = options.collect ?? collectSitemapInventory
  fastify.addHook("preHandler", async (request, reply) => {
    const params = Scope.safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: "Projet invalide" })
    if (!await assertProjectOwner(params.data.projectId, request.userId, request.tenantId)) return reply.status(404).send({ error: "Projet introuvable" })
  })

  fastify.get<{ Params: { projectId: string } }>("/api/projects/:projectId/url-inventory", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = Query.safeParse(request.query)
    if (!parsed.success) return reply.status(400).send({ error: "Filtres d’inventaire invalides" })
    const tenantId = request.tenantId, projectId = request.params.projectId
    const project = await assertProjectOwner(projectId, request.userId, tenantId)
    if (!project) return reply.status(404).send({ error: "Projet introuvable" })
    const [audit, sitemapSnapshot, searchSnapshot] = await Promise.all([
      prisma.audit.findFirst({ where: { projectId, tenantId, userId: request.userId, status: "COMPLETED", deletedAt: null }, orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }], select: { id: true, url: true, completedAt: true, _count: { select: { pages: true } } } }),
      prisma.sitemapSnapshot.findFirst({ where: { projectId, tenantId }, orderBy: [{ importedAt: "desc" }, { id: "desc" }] }),
      prisma.searchConsoleSnapshot.findFirst({ where: { projectId, tenantId }, orderBy: { importedAt: "desc" }, select: { id: true, propertyUrl: true, importedAt: true, startDate: true, endDate: true, rowLimitReached: true, _count: { select: { pages: true } } } }),
    ])
    const sitemap = readSitemapInventory(sitemapSnapshot?.data)
    const [pages, search] = await Promise.all([audit ? loadLinkingAuditPages(audit.id, tenantId) : [], searchSnapshot ? searchPages(searchSnapshot.id, tenantId) : { pages: [], limited: false }])
    const analysis = buildInternalLinkAnalysis(pages, project.domain, audit?.url ?? project.domain)
    analysis.limits.pages ||= (audit?._count.pages ?? 0) > pages.length
    const urls = inventoryUrls(sitemap, search.pages, project.domain).urls
    // Look up inventory presence against ALL audit pages; the graph budget must not manufacture crawl absences.
    const auditedUrls: string[] = []
    if (audit) for (let offset = 0; offset < urls.length; offset += 1000) {
      const found = await prisma.auditPage.findMany({ where: { auditId: audit.id, tenantId, url: { in: urls.slice(offset, offset + 1000) } }, select: { url: true } })
      auditedUrls.push(...found.map(page => page.url))
    }
    const result = buildUrlInventory({ projectUrl: project.domain, entryUrl: audit?.url ?? project.domain, hasAudit: !!audit, auditPages: pages, analysis, auditedUrls, sitemap, searchPages: search.pages, staleSearch: !!searchSnapshot && stale(searchSnapshot.importedAt) })
    const items = result.items
    const { mode, q } = parsed.data, needle = q.toLocaleLowerCase("fr")
    const filtered = items.filter(item => matchesUrlInventoryMode(item, mode) && [item.url, item.title ?? ""].some(value => value.toLocaleLowerCase("fr").includes(needle)))
    const pageCount = Math.max(1, Math.ceil(filtered.length / 25)), page = Math.min(parsed.data.page, pageCount)
    const data: ProjectUrlInventory = {
      audit: audit ? { id: audit.id, completedAt: audit.completedAt?.toISOString() ?? null, pageCount: audit._count.pages, analyzedPages: analysis.nodes.length } : null,
      sitemap: sitemapSnapshot && sitemap ? { id: sitemapSnapshot.id, importedAt: sitemapSnapshot.importedAt.toISOString(), pageCount: sitemap.pages.length, stale: stale(sitemapSnapshot.importedAt), data: { version: 1, roots: sitemap.roots, documents: sitemap.documents, omittedUrls: sitemap.omittedUrls, limits: sitemap.limits } } : null,
      searchConsole: searchSnapshot ? { id: searchSnapshot.id, propertyUrl: searchSnapshot.propertyUrl, importedAt: searchSnapshot.importedAt.toISOString(), startDate: searchSnapshot.startDate, endDate: searchSnapshot.endDate,
        pageCount: searchSnapshot._count.pages, stale: stale(searchSnapshot.importedAt), limited: searchSnapshot.rowLimitReached || search.limited || search.pages.length < searchSnapshot._count.pages } : null,
      coverage: { graphPartial: analysis.limits.pages || analysis.limits.links, inventoryLimited: result.limited || search.limited || !!sitemapSnapshot && !sitemap },
      summary: { inventoried: items.length, investigate: items.filter(item => matchesUrlInventoryMode(item, "investigate")).length,
        notCrawled: items.filter(item => matchesUrlInventoryMode(item, "not-crawled")).length, withoutIncoming: items.filter(item => item.state === "NO_INCOMING").length,
        linkedNotCrawled: items.filter(item => item.state === "LINKED_NOT_CRAWLED").length, excluded: items.filter(item => item.state === "EXCLUDED").length, unassessed: items.filter(item => item.state === "UNASSESSED").length },
      items: filtered.slice((page - 1) * 25, page * 25), mode, page, pageCount, total: filtered.length,
    }
    return reply.send(data)
  })

  fastify.post<{ Params: { projectId: string } }>("/api/projects/:projectId/url-inventory/sitemaps/sync", { preHandler: requireRole("MEMBER"), config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (request, reply) => {
    const parsed = Sync.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: "URL de sitemap invalide" })
    const projectId = request.params.projectId, tenantId = request.tenantId
    const project = await assertProjectOwner(projectId, request.userId, tenantId)
    if (!project) return reply.status(404).send({ error: "Projet introuvable" })
    const supplied = parsed.data.sitemapUrl, sitemapUrl = supplied ? normalizeInternalLinkUrl(supplied) : undefined
    if (supplied && (!sitemapUrl || !isValidPublicUrl(sitemapUrl) || new URL(sitemapUrl).origin !== new URL(project.domain).origin)) return reply.status(400).send({ error: "Utilisez un sitemap public sur la même origine que le projet." })
    const lease = new Date()
    const acquired = await prisma.project.updateMany({ where: { id: projectId, tenantId, userId: request.userId, deletedAt: null, OR: [{ sitemapSyncStartedAt: null }, { sitemapSyncStartedAt: { lt: new Date(lease.getTime() - 180_000) } }] }, data: { sitemapSyncStartedAt: lease } })
    if (!acquired.count) return reply.status(409).send({ error: "Un import de sitemaps est déjà en cours." })
    try {
      const inventory = await collect(project.domain, sitemapUrl ?? undefined)
      if (!readSitemapInventory(inventory) || Buffer.byteLength(JSON.stringify(inventory), "utf8") > 4 * 1024 * 1024) throw new Error("Invalid inventory")
      const origin = new URL(project.domain).origin
      if (![...inventory.roots, ...inventory.documents.map(doc => doc.url)].every(url => isValidPublicUrl(url) && new URL(url).origin === origin)
        || !inventory.pages.every(page => isValidPublicUrl(page.url) && internalLinkBelongsToProject(page.url, project.domain))) throw new Error("Inventory outside project")
      const snapshot = await prisma.$transaction(async tx => {
        const valid = await tx.project.updateMany({ where: { id: projectId, tenantId, userId: request.userId, deletedAt: null, sitemapSyncStartedAt: lease }, data: { sitemapSyncStartedAt: null } })
        if (!valid.count) throw new Error("Lease expired")
        const saved = await tx.sitemapSnapshot.create({ data: { projectId, tenantId, pageCount: inventory.pages.length, data: JSON.parse(JSON.stringify(inventory)) } })
        const old = await tx.sitemapSnapshot.findMany({ where: { projectId, tenantId }, orderBy: [{ importedAt: "desc" }, { id: "desc" }], skip: 5, select: { id: true } })
        if (old.length) await tx.sitemapSnapshot.deleteMany({ where: { projectId, tenantId, id: { in: old.map(row => row.id) } } })
        return saved
      })
      const result: SitemapSyncResult = { importedAt: snapshot.importedAt.toISOString(), pageCount: inventory.pages.length, documentCount: inventory.documents.filter(doc => doc.status === "OK").length,
        partial: Object.values(inventory.limits).some(Boolean) || inventory.documents.some(doc => doc.status !== "OK") || inventory.omittedUrls > 0 }
      return reply.send(result)
    } catch {
      return reply.status(502).send({ error: "L’import des sitemaps a échoué. Vérifiez l’URL, le format XML et l’accès public. Le dernier inventaire enregistré est conservé." })
    } finally {
      await prisma.project.updateMany({ where: { id: projectId, tenantId, sitemapSyncStartedAt: lease }, data: { sitemapSyncStartedAt: null } })
    }
  })
}
export default urlInventoryRoutes
