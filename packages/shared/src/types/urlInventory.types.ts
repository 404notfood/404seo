import type { InternalLinkAnalysis, InternalLinkPageInput } from "./internalLinks.types"

export type SitemapDocumentStatus = "OK" | "HTTP_ERROR" | "FETCH_ERROR" | "INVALID_XML" | "TOO_LARGE" | "REDIRECT_BLOCKED"

export interface SitemapDocument {
  url: string
  status: SitemapDocumentStatus
  httpStatus: number | null
  kind: "URLSET" | "INDEX" | null
  urlCount: number
}

export interface SitemapInventoryPage {
  url: string
  documentIndexes: number[]
}

export interface SitemapInventory {
  version: 1
  roots: string[]
  documents: SitemapDocument[]
  pages: SitemapInventoryPage[]
  omittedUrls: number
  limits: { documents: boolean; urls: boolean; bytes: boolean; time: boolean; depth: boolean; stored: boolean }
}

export type UrlInventoryState = "NO_AUDIT" | "NOT_CRAWLED" | "LINKED_NOT_CRAWLED" | "NO_INCOMING" | "LINKED" | "EXCLUDED" | "UNASSESSED"
export type UrlInventoryMode = "investigate" | "all" | "not-crawled" | "without-incoming" | "linked-not-crawled" | "excluded"

export interface UrlInventoryItem {
  url: string
  title: string | null
  state: UrlInventoryState
  incoming: number | null
  exclusion: string | null
  sitemapUrls: string[]
  inSearchConsole: boolean
  search: { clicks: number; impressions: number } | null
}

export interface ProjectUrlInventory {
  audit: { id: string; completedAt: string | null; pageCount: number; analyzedPages: number } | null
  sitemap: { id: string; importedAt: string; pageCount: number; stale: boolean; data: Omit<SitemapInventory, "pages"> } | null
  searchConsole: { id: string; propertyUrl: string; importedAt: string; startDate: string; endDate: string; pageCount: number; stale: boolean; limited: boolean } | null
  coverage: { graphPartial: boolean; inventoryLimited: boolean }
  summary: { inventoried: number; investigate: number; notCrawled: number; withoutIncoming: number; linkedNotCrawled: number; excluded: number; unassessed: number }
  items: UrlInventoryItem[]
  mode: UrlInventoryMode
  page: number
  pageCount: number
  total: number
}

export interface SitemapSyncResult {
  importedAt: string
  pageCount: number
  documentCount: number
  partial: boolean
}

export interface UrlInventorySearchPage { pageUrl: string; clicks: number; impressions: number }
export interface UrlInventoryBuildInput {
  projectUrl: string
  entryUrl: string
  hasAudit: boolean
  auditPages: InternalLinkPageInput[]
  analysis: InternalLinkAnalysis
  /** Presence is checked against the complete audit, including pages outside the graph budget. */
  auditedUrls: string[]
  sitemap: SitemapInventory | null
  searchPages: UrlInventorySearchPage[]
  staleSearch: boolean
}
