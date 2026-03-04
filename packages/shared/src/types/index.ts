// Types partagés entre tous les packages

export type CheckStatus = "PASS" | "WARN" | "FAIL"
export type Category = "TECHNICAL" | "ON_PAGE" | "PERFORMANCE" | "UX_MOBILE"
export type Priority = "HIGH" | "MEDIUM" | "LOW"
export type Effort = "HIGH" | "MEDIUM" | "LOW"

export interface CheckResult {
  category: Category
  checkName: string
  status: CheckStatus
  score: number
  value?: string
  expected?: string
  message: string
  priority: Priority
  effort: Effort
}

export interface PageData {
  url: string
  statusCode: number
  redirectUrl?: string
  responseTime: number
  pageSize: number
  title?: string
  metaDescription?: string
  h1: string[]
  headings: { h2: string[]; h3: string[]; h4: string[] }
  canonicalUrl?: string
  isIndexable: boolean
  metaRobots?: string
  images: { src: string; alt?: string; hasAlt: boolean; width?: number; height?: number }[]
  internalLinks: string[]
  externalLinks: string[]
  schemaOrgTypes: string[]
  rawHtml?: string
  hasViewport: boolean
  lang?: string
  ogTags?: { title?: string; description?: string; image?: string; type?: string }
  wordCount?: number
  bodyText?: string
  topKeywords?: import("../keywords").KeywordEntry[]
  hasRobotsTxt?: boolean
  hasSitemap?: boolean
  hasResponsiveMeta?: boolean
  smallTapTargets?: number
  smallFontSizes?: number
  error?: string
}

export interface LighthouseData {
  performance: number
  accessibility: number
  seo: number
  lcp: number
  cls: number
  fid: number
  ttfb: number
  tbt: number
}

export interface CrawlOptions {
  maxPages?: number
  maxDepth?: number
  timeout?: number
  userAgent?: string
  respectRobots?: boolean
  device?: "desktop" | "mobile"
}

export interface CrawlJobData {
  auditId: string
  url: string
  options: {
    maxPages?: number
    maxDepth?: number
    device?: "desktop" | "mobile"
  }
}

export interface AnalyzeJobData {
  auditId: string
  pageIds: string[]
}

export interface ReportJobData {
  auditId: string
}
