// lib/api-client.ts — Client HTTP vers l'API Fastify

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

function getSessionToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/better-auth\.session_token=([^;]+)/)
  if (!match) return null
  // BetterAuth encode le token comme "token.signature" — on veut juste le token
  return match[1].split(".")[0]
}

async function fetcher<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    credentials: "include",
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export interface UserMe {
  id: string
  name: string
  email: string
  image: string | null
  role: "ADMIN" | "MEMBER" | "GUEST"
  tenantId: string | null
  tenant: {
    id: string
    name: string
    slug: string
    plan: "STARTER" | "PRO" | "AGENCY" | "ENTERPRISE"
  } | null
}

export const apiClient = {
  // User
  getMe: () => fetcher<UserMe>("/api/me"),

  // Audits
  getAudits: () => fetcher<Audit[]>("/api/audits"),
  getAuditStats: () => fetcher<AuditStats>("/api/audits/stats"),
  getAudit: (id: string) => fetcher<AuditDetail>(`/api/audits/${id}`),
  launchAudit: (data: LaunchAuditInput) =>
    fetcher<{ auditId: string; jobId: string }>("/api/audits", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAuditBreakdown: (id: string) => fetcher<PageBreakdown>(`/api/audits/${id}/breakdown`),
  getAuditKeywords: (id: string) => fetcher<AuditKeywords>(`/api/audits/${id}/keywords`),
  deleteAudit: (id: string) =>
    fetcher<void>(`/api/audits/${id}`, { method: "DELETE" }),

  // Billing
  getBilling: () => fetcher<BillingInfo>("/api/billing"),
  createCheckout: (plan: string) =>
    fetcher<{ url: string }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),
  createPortal: () =>
    fetcher<{ url: string }>("/api/billing/portal", { method: "POST" }),

  // Tenant / Branding
  getTenant: () => fetcher<TenantInfo>("/api/tenant"),
  updateBranding: (data: UpdateBrandingInput) =>
    fetcher<TenantInfo>("/api/tenant/branding", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Projects
  getProjects: () => fetcher<Project[]>("/api/projects"),
  createProject: (data: CreateProjectInput) =>
    fetcher<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    fetcher<void>(`/api/projects/${id}`, { method: "DELETE" }),

  // Aggregation
  getIssues: (params?: { category?: string; status?: string; priority?: string; page?: number; limit?: number }) => {
    const sp = new URLSearchParams()
    if (params?.category) sp.set("category", params.category)
    if (params?.status) sp.set("status", params.status)
    if (params?.priority) sp.set("priority", params.priority)
    if (params?.page) sp.set("page", String(params.page))
    if (params?.limit) sp.set("limit", String(params.limit))
    const qs = sp.toString()
    return fetcher<IssuesResponse>(`/api/issues${qs ? `?${qs}` : ""}`)
  },
  getPerformanceOverview: () => fetcher<PerformanceOverview>("/api/performance-overview"),
  getOnPageOverview: () => fetcher<OnPageOverview>("/api/on-page-overview"),
  getContentOverview: (params?: { thin?: boolean; noMeta?: boolean; noH1?: boolean; page?: number; limit?: number }) => {
    const sp = new URLSearchParams()
    if (params?.thin) sp.set("thin", "true")
    if (params?.noMeta) sp.set("noMeta", "true")
    if (params?.noH1) sp.set("noH1", "true")
    if (params?.page) sp.set("page", String(params.page))
    if (params?.limit) sp.set("limit", String(params.limit))
    const qs = sp.toString()
    return fetcher<ContentOverview>(`/api/content-overview${qs ? `?${qs}` : ""}`)
  },
  getStatsTimeline: () => fetcher<StatsTimeline>("/api/stats/timeline"),
  getOptimization: () => fetcher<OptimizationOverview>("/api/optimization"),

  // SEO Local
  getLocalDashboard: () => fetcher<LocalDashboard>("/api/local/dashboard"),
  getLocalListings: () => fetcher<GBPListing[]>("/api/local/listings"),
  getLocalReviews: (listingId: string) => fetcher<LocalReviewsData>(`/api/local/listings/${listingId}/reviews`),
  getLocalPosts: (listingId: string) => fetcher<LocalPostsData>(`/api/local/listings/${listingId}/posts`),
  getLocalRankings: (listingId: string) => fetcher<LocalRankingsData>(`/api/local/listings/${listingId}/rankings`),
}

export interface BillingInfo {
  plan: "STARTER" | "PRO" | "AGENCY"
  subscription: {
    status: string
    pagesQuota: number
    pagesUsed: number
    currentPeriodEnd: string | null
  } | null
}

export interface AuditStats {
  total: number
  completed: number
  avgScore: number | null
  totalCritical: number
  totalPassed: number
  recent: Array<{
    id: string
    url: string
    status: AuditStatus
    createdAt: string
    project: { name: string }
    report: { scoreGlobal: number } | null
  }>
}

// ─── Types réponses API ───────────────────────

export type AuditStatus =
  | "PENDING" | "CRAWLING" | "ANALYZING"
  | "SCORING" | "GENERATING_REPORT" | "COMPLETED"
  | "FAILED" | "CANCELLED"

export interface Audit {
  id: string
  url: string
  status: AuditStatus
  createdAt: string
  completedAt: string | null
  project: { name: string; domain: string }
  report: { scoreGlobal: number; criticalIssues: number | null } | null
  jobs: { type: string; status: string; progress: number }[]
}

export interface AuditReport {
  scoreGlobal: number
  scoreTechnical: number
  scoreOnPage: number
  scorePerformance: number
  scoreUX: number
  totalPages: number | null
  totalIssues: number | null
  criticalIssues: number | null
  warnings: number | null
  passed: number | null
}

export interface PageResult {
  id: string
  category: "TECHNICAL" | "ON_PAGE" | "PERFORMANCE" | "UX_MOBILE"
  checkName: string
  status: "PASS" | "WARN" | "FAIL"
  score: number
  value: string | null
  expected: string | null
  message: string
  priority: "HIGH" | "MEDIUM" | "LOW"
  effort: "HIGH" | "MEDIUM" | "LOW"
}

export interface AuditDetail extends Audit {
  report: AuditReport | null
  pages: Array<{
    id: string
    url: string
    statusCode: number | null
    redirectUrl?: string | null
    isIndexable?: boolean | null
    hasRobotsTxt?: boolean | null
    hasSitemap?: boolean | null
    wordCount?: number | null
    lang?: string | null
    results: PageResult[]
  }>
}

export interface KeywordEntry {
  term: string
  count: number
  score: number
  positions: string[]
}

export interface SiteKeywordEntry {
  term: string
  totalCount: number
  pageCount: number
  avgScore: number
  positions: string[]
  topPages: { url: string; count: number }[]
}

export interface AuditKeywords {
  siteKeywords: { keywords: SiteKeywordEntry[]; totalPages: number } | null
  pageKeywords: Array<{ id: string; url: string; topKeywords: KeywordEntry[] }>
}

export interface PageBreakdown {
  breakdown: { healthy: number; redirects: number; errors: number; blocked: number }
  topIssues: Array<{
    checkName: string
    category: string
    failCount: number
    warnCount: number
    maxPriority: string
    score: number
  }>
  totalPages: number
}

export interface Project {
  id: string
  name: string
  domain: string
  description: string | null
  createdAt: string
  _count: { audits: number }
}

export interface LaunchAuditInput {
  url: string
  projectId: string
  options?: {
    maxPages?: number
    maxDepth?: number
    device?: "desktop" | "mobile"
  }
}

export interface CreateProjectInput {
  name: string
  domain: string
  description?: string
}

export interface TenantInfo {
  id: string
  name: string
  slug: string
  plan: "STARTER" | "PRO" | "AGENCY" | "ENTERPRISE"
  logoUrl: string | null
  brandColor: string | null
  customDomain: string | null
}

export interface UpdateBrandingInput {
  name?: string
  logoUrl?: string | null
  brandColor?: string | null
}

// ─── Types agrégation ─────────────────────────

export interface IssueItem {
  id: string
  category: "TECHNICAL" | "ON_PAGE" | "PERFORMANCE" | "UX_MOBILE"
  checkName: string
  status: "FAIL" | "WARN"
  score: number
  value: string | null
  expected: string | null
  message: string
  priority: "HIGH" | "MEDIUM" | "LOW"
  effort: "HIGH" | "MEDIUM" | "LOW"
  page: { url: string; audit: { id: string; url: string; project: { name: string } } }
}

export interface IssuesResponse {
  items: IssueItem[]
  total: number
  page: number
  totalPages: number
  counts: { critical: number; warnings: number; total: number }
}

export interface PerformanceOverview {
  avgScore: number
  reports: Array<{ auditId: string; url: string; date: string; scorePerformance: number }>
  avgResponseTime: number
  avgPageSize: number
  imageOptRate: number
  slowestPages: Array<{ url: string; responseTime: number; pageSize: number; auditUrl: string }>
}

export interface OnPageOverview {
  avgScore: number
  reports: Array<{ auditId: string; url: string; date: string; scoreOnPage: number }>
  missingTitles: number
  missingMeta: number
  missingH1: number
  missingAlt: number
  worstPages: Array<{ url: string; issueCount: number; auditUrl: string }>
}

export interface ContentItem {
  url: string
  wordCount: number | null
  title: string | null
  titleLength: number | null
  metaDescription: string | null
  metaDescLength: number | null
  h1: string[]
  auditUrl: string
}

export interface ContentOverview {
  items: ContentItem[]
  total: number
  page: number
  totalPages: number
}

export interface TimelineEntry {
  auditId: string
  url: string
  date: string
  scoreGlobal: number
  scoreTechnical: number
  scoreOnPage: number
  scorePerformance: number
  scoreUX: number
}

export interface StatsTimeline {
  timeline: TimelineEntry[]
  distribution: { pass: number; warn: number; fail: number }
}

export interface OptimizationRec {
  checkName: string
  category: string
  failCount: number
  warnCount: number
  priority: string
  effort: string
  message: string
  impactScore: number
}

export interface OptimizationOverview {
  recommendations: OptimizationRec[]
}

// ─── Types SEO Local (GBP) ───────────────────

export interface GBPListing {
  id: string
  businessName: string
  category: string
  phone: string | null
  website: string | null
  address: string
  lat: number | null
  lng: number | null
  openingHours: unknown
  completionScore: number
  isVerified: boolean
  status: "ACTIVE" | "SUSPENDED" | "CLOSED" | "DUPLICATE"
  createdAt: string
  _count: { reviews: number; posts: number; rankings: number; photos: number }
}

export interface GBPReview {
  id: string
  authorName: string
  rating: number
  text: string | null
  replyText: string | null
  replyStatus: "PENDING" | "REPLIED" | "IGNORED"
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | null
  aiSuggestedReply: string | null
  publishedAt: string
}

export interface GBPPost {
  id: string
  type: "UPDATE" | "EVENT" | "OFFER"
  content: string
  imageUrl: string | null
  ctaType: string | null
  ctaUrl: string | null
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED"
  scheduledAt: string | null
  publishedAt: string | null
  views: number
  clicks: number
  createdAt: string
}

export interface GBPRanking {
  id: string
  keyword: string
  positions: unknown
  avgRank: number
  bestRank: number
  checkedAt: string
}

export interface LocalDashboard {
  listings: GBPListing[]
  avgRating: number
  totalReviews: number
  pendingReplies: number
  postsThisMonth: number
}

export interface LocalReviewsData {
  reviews: GBPReview[]
  stats: { avgRating: number; total: number; distribution: Record<string, number> }
}

export interface LocalPostsData {
  posts: GBPPost[]
  total: number
}

export interface LocalRankingsData {
  rankings: GBPRanking[]
}
