import { internalLinkBelongsToProject, normalizeInternalLinkUrl, readLinkingData } from "./internalLinks"
import type { SitemapInventory, UrlInventoryItem, UrlInventoryMode, UrlInventoryBuildInput, UrlInventorySearchPage } from "./types/urlInventory.types"

export const URL_INVENTORY_LIMITS = { urls: 10_000, referenceEdges: 100_000, sourceBytes: 4 * 1024 * 1024 } as const

export function readSitemapInventory(value: unknown): SitemapInventory | null {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  if (data.version !== 1 || !Array.isArray(data.pages) || data.pages.length > URL_INVENTORY_LIMITS.urls || !Array.isArray(data.documents) || data.documents.length > 20
    || !Array.isArray(data.roots) || data.roots.length > 20 || !data.roots.every(root => typeof root === "string" && !!normalizeInternalLinkUrl(root))
    || typeof data.omittedUrls !== "number" || !Number.isSafeInteger(data.omittedUrls) || data.omittedUrls < 0 || !data.limits || typeof data.limits !== "object") return null
  const limits = data.limits as Record<string, unknown>
  if (!["documents", "urls", "bytes", "time", "depth", "stored"].every(key => typeof limits[key] === "boolean")) return null
  const documents: SitemapInventory["documents"] = []
  for (const raw of data.documents) {
    if (!raw || typeof raw !== "object") return null
    const doc = raw as Record<string, unknown>
    if (typeof doc.url !== "string" || !normalizeInternalLinkUrl(doc.url) || !["OK", "HTTP_ERROR", "FETCH_ERROR", "INVALID_XML", "TOO_LARGE", "REDIRECT_BLOCKED"].includes(String(doc.status))
      || !["URLSET", "INDEX", null].includes(doc.kind as string | null) || (doc.httpStatus !== null && (typeof doc.httpStatus !== "number" || !Number.isInteger(doc.httpStatus)))
      || typeof doc.urlCount !== "number" || !Number.isSafeInteger(doc.urlCount) || doc.urlCount < 0) return null
    documents.push(doc as unknown as SitemapInventory["documents"][number])
  }
  const pages: SitemapInventory["pages"] = []
  for (const raw of data.pages) {
    if (!raw || typeof raw !== "object") return null
    const page = raw as Record<string, unknown>
    if (typeof page.url !== "string" || !normalizeInternalLinkUrl(page.url) || !Array.isArray(page.documentIndexes) || page.documentIndexes.length < 1 || page.documentIndexes.length > 3
      || !page.documentIndexes.every(index => Number.isInteger(index) && index >= 0 && index < documents.length && documents[index].status === "OK" && documents[index].kind === "URLSET")) return null
    pages.push({ url: page.url, documentIndexes: page.documentIndexes as number[] })
  }
  return { version: 1, pages, documents, roots: data.roots as string[], omittedUrls: data.omittedUrls,
    limits: { documents: limits.documents as boolean, urls: limits.urls as boolean, bytes: limits.bytes as boolean, time: limits.time as boolean, depth: limits.depth as boolean, stored: limits.stored as boolean } }
}

export function inventoryUrls(sitemap: SitemapInventory | null, search: UrlInventorySearchPage[], projectUrl: string): { urls: string[]; limited: boolean } {
  const urls = new Set<string>()
  let bytes = 0, limited = false
  for (const raw of [...(sitemap?.pages.map(page => page.url) ?? []), ...search.map(page => page.pageUrl)]) {
    const url = normalizeInternalLinkUrl(raw)
    if (!url || !internalLinkBelongsToProject(url, projectUrl) || urls.has(url)) continue
    if (urls.size >= URL_INVENTORY_LIMITS.urls || bytes + url.length * 2 > URL_INVENTORY_LIMITS.sourceBytes) { limited = true; break }
    urls.add(url); bytes += url.length * 2
  }
  return { urls: [...urls], limited }
}

export function buildUrlInventory(input: UrlInventoryBuildInput): { items: UrlInventoryItem[]; limited: boolean } {
  const inventory = inventoryUrls(input.sitemap, input.searchPages, input.projectUrl)
  const items = new Map<string, UrlInventoryItem>(inventory.urls.map(url => [url, { url, title: null, state: "NO_AUDIT", incoming: null, exclusion: null, sitemapUrls: [], inSearchConsole: false, search: null }]))
  for (const page of input.sitemap?.pages ?? []) {
    const item = items.get(normalizeInternalLinkUrl(page.url) ?? "")
    if (item) item.sitemapUrls = [...new Set(page.documentIndexes.flatMap(index => {
      const doc = input.sitemap?.documents[index]
      return doc?.status === "OK" && internalLinkBelongsToProject(doc.url, new URL(input.projectUrl).origin) ? [doc.url] : []
    }))].slice(0, 3)
  }
  for (const row of input.searchPages) {
    const item = items.get(normalizeInternalLinkUrl(row.pageUrl) ?? "")
    if (item && [row.clicks, row.impressions].every(value => Number.isFinite(value) && value >= 0) && !item.inSearchConsole) {
      item.inSearchConsole = true; item.search = { clicks: row.clicks, impressions: row.impressions }
    }
  }
  const nodes = new Map(input.analysis.nodes.map(node => [node.url, node]))
  const sources = new Set(input.analysis.nodes.map(node => node.url))
  const presence = new Set(input.auditedUrls.map(url => normalizeInternalLinkUrl(url)))
  const referencedBy = new Map<string, Set<string>>()
  let edges = 0, limited = inventory.limited
  for (const page of input.auditPages) {
    const source = normalizeInternalLinkUrl(page.url)
    if (!source || !sources.has(source)) continue
    const targets = new Set([...page.internalLinkUrls.slice(0, 500), ...(readLinkingData(page.linkingData)?.links.map(link => link.url) ?? [])].map(raw => normalizeInternalLinkUrl(raw, page.redirectUrl ?? source)))
    for (const target of targets) {
      if (!target || target === source || !items.has(target)) continue
      if (edges++ >= URL_INVENTORY_LIMITS.referenceEdges) { limited = true; break }
      const refs = referencedBy.get(target) ?? new Set<string>(); refs.add(source); referencedBy.set(target, refs)
    }
    if (edges >= URL_INVENTORY_LIMITS.referenceEdges) break
  }
  const entry = normalizeInternalLinkUrl(input.entryUrl)
  for (const item of items.values()) {
    if (!input.hasAudit) continue
    const node = nodes.get(item.url)
    const count = referencedBy.get(item.url)?.size ?? 0
    item.title = node?.title ?? null
    if (node) {
      item.incoming = Math.max(node.incoming, count)
      item.exclusion = node.exclusion
      item.state = !node.eligible ? "EXCLUDED" : item.incoming > 0 || item.url === entry ? "LINKED" : "NO_INCOMING"
    } else if (presence.has(item.url)) {
      item.incoming = count || null
      item.state = count ? "LINKED" : "UNASSESSED"
    } else {
      item.incoming = count
      item.state = count ? "LINKED_NOT_CRAWLED" : "NOT_CRAWLED"
    }
  }
  const rank = { NO_INCOMING: 0, NOT_CRAWLED: 1, LINKED_NOT_CRAWLED: 2, UNASSESSED: 3, EXCLUDED: 4, LINKED: 5, NO_AUDIT: 6 }
  return { limited, items: [...items.values()].sort((a, b) => rank[a.state] - rank[b.state] || (!input.staleSearch ? (b.search?.impressions ?? 0) - (a.search?.impressions ?? 0) : 0) || a.url.localeCompare(b.url)) }
}

export function matchesUrlInventoryMode(item: UrlInventoryItem, mode: UrlInventoryMode): boolean {
  if (mode === "all") return true
  if (mode === "investigate") return ["NO_INCOMING", "NOT_CRAWLED"].includes(item.state)
  if (mode === "not-crawled") return ["NOT_CRAWLED", "LINKED_NOT_CRAWLED"].includes(item.state)
  if (mode === "without-incoming") return item.state === "NO_INCOMING"
  if (mode === "linked-not-crawled") return item.state === "LINKED_NOT_CRAWLED"
  return item.state === "EXCLUDED"
}
