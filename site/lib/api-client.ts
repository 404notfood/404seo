// lib/api-client.ts — Client HTTP vers l'API Fastify

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

export function getSessionToken(): string | null {
  if (typeof document === "undefined") return null
  // BetterAuth utilise le préfixe __Secure- en HTTPS, sans préfixe en HTTP
  const match = document.cookie.match(/(?:__Secure-)?better-auth\.session_token=([^;]+)/)
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
  getAudits: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<Audit[]>(`/api/audits${qs}`)
  },
  getAuditStats: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<AuditStats>(`/api/audits/stats${qs}`)
  },
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
  downloadAuditPdf: async (id: string, hostname: string) => {
    const token = getSessionToken()
    const res = await fetch(`${API_URL}/api/audits/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
    if (!res.ok) throw new Error("Erreur génération PDF")
    const blob = await res.blob()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `audit-seo-${hostname}.pdf`
    a.click()
    URL.revokeObjectURL(a.href)
  },

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
  getIssues: (params?: { category?: string; status?: string; priority?: string; page?: number; limit?: number; projectId?: string | null }) => {
    const sp = new URLSearchParams()
    if (params?.category) sp.set("category", params.category)
    if (params?.status) sp.set("status", params.status)
    if (params?.priority) sp.set("priority", params.priority)
    if (params?.page) sp.set("page", String(params.page))
    if (params?.limit) sp.set("limit", String(params.limit))
    if (params?.projectId) sp.set("projectId", params.projectId)
    const qs = sp.toString()
    return fetcher<IssuesResponse>(`/api/issues${qs ? `?${qs}` : ""}`)
  },
  getPerformanceOverview: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<PerformanceOverview>(`/api/performance-overview${qs}`)
  },
  getOnPageOverview: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<OnPageOverview>(`/api/on-page-overview${qs}`)
  },
  getContentOverview: (params?: { thin?: boolean; noMeta?: boolean; noH1?: boolean; page?: number; limit?: number; projectId?: string | null }) => {
    const sp = new URLSearchParams()
    if (params?.thin) sp.set("thin", "true")
    if (params?.noMeta) sp.set("noMeta", "true")
    if (params?.noH1) sp.set("noH1", "true")
    if (params?.page) sp.set("page", String(params.page))
    if (params?.limit) sp.set("limit", String(params.limit))
    if (params?.projectId) sp.set("projectId", params.projectId)
    const qs = sp.toString()
    return fetcher<ContentOverview>(`/api/content-overview${qs ? `?${qs}` : ""}`)
  },
  getStatsTimeline: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<StatsTimeline>(`/api/stats/timeline${qs}`)
  },
  getOptimization: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<OptimizationOverview>(`/api/optimization${qs}`)
  },

  // SEO Local
  getLocalDashboard: () => fetcher<LocalDashboard>("/api/local/dashboard"),
  getLocalListings: () => fetcher<GBPListing[]>("/api/local/listings"),
  createListing: (data: CreateListingInput) =>
    fetcher<GBPListing>("/api/local/listings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getLocalReviews: (listingId: string) => fetcher<LocalReviewsData>(`/api/local/listings/${listingId}/reviews`),
  replyToReview: (listingId: string, reviewId: string, replyText: string) =>
    fetcher<GBPReview>(`/api/local/listings/${listingId}/reviews/${reviewId}/reply`, {
      method: "POST",
      body: JSON.stringify({ replyText }),
    }),
  aiSuggestReply: (listingId: string, reviewId: string) =>
    fetcher<{ suggestion: string }>(`/api/local/listings/${listingId}/reviews/${reviewId}/ai-suggest`, {
      method: "POST",
    }),
  getLocalPosts: (listingId: string) => fetcher<LocalPostsData>(`/api/local/listings/${listingId}/posts`),
  createPost: (listingId: string, data: CreatePostInput) =>
    fetcher<GBPPost>(`/api/local/listings/${listingId}/posts`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getLocalRankings: (listingId: string) => fetcher<LocalRankingsData>(`/api/local/listings/${listingId}/rankings`),

  // Rank Tracking
  getRankTracking: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<RankTrackingData>(`/api/rank-tracking${qs}`)
  },
  addKeyword: (data: AddKeywordInput) =>
    fetcher<RankedKeyword>("/api/rank-tracking", { method: "POST", body: JSON.stringify(data) }),
  deleteKeyword: (id: string) =>
    fetcher<void>(`/api/rank-tracking/${id}`, { method: "DELETE" }),
  checkKeywordPosition: (id: string, domain?: string) =>
    fetcher<{ message: string }>(`/api/rank-tracking/${id}/check`, {
      method: "POST",
      body: JSON.stringify(domain ? { domain } : {}),
    }),
  checkAllPositions: (projectId?: string, domain?: string) =>
    fetcher<{ message: string }>("/api/rank-tracking/check-all", {
      method: "POST",
      body: JSON.stringify({ projectId, domain }),
    }),

  // Backlinks
  getBacklinks: (params?: { projectId?: string | null; domain?: string; page?: number }) => {
    const sp = new URLSearchParams()
    if (params?.projectId) sp.set("projectId", params.projectId)
    if (params?.domain) sp.set("domain", params.domain)
    if (params?.page) sp.set("page", String(params.page))
    const qs = sp.toString()
    return fetcher<BacklinksData>(`/api/backlinks${qs ? `?${qs}` : ""}`)
  },
  fetchBacklinks: (domain: string, projectId?: string) =>
    fetcher<{ message: string }>("/api/backlinks/fetch", {
      method: "POST",
      body: JSON.stringify({ domain, projectId }),
    }),
  addBacklink: (data: AddBacklinkInput) =>
    fetcher<BacklinkItem>("/api/backlinks", { method: "POST", body: JSON.stringify(data) }),
  deleteBacklink: (id: string) =>
    fetcher<void>(`/api/backlinks/${id}`, { method: "DELETE" }),

  // Competitors
  getCompetitors: (projectId?: string | null) => {
    const qs = projectId ? `?projectId=${projectId}` : ""
    return fetcher<CompetitorsData>(`/api/competitors${qs}`)
  },
  addCompetitor: (data: { domain: string; label?: string; projectId?: string }) =>
    fetcher<CompetitorItem>("/api/competitors", { method: "POST", body: JSON.stringify(data) }),
  deleteCompetitor: (id: string) =>
    fetcher<void>(`/api/competitors/${id}`, { method: "DELETE" }),

  // AI Visibility
  getAIVisibility: (params?: { domain?: string; engine?: string }) => {
    const sp = new URLSearchParams()
    if (params?.domain) sp.set("domain", params.domain)
    if (params?.engine) sp.set("engine", params.engine)
    const qs = sp.toString()
    return fetcher<AIVisibilityData>(`/api/ai-visibility${qs ? `?${qs}` : ""}`)
  },
  checkAIVisibility: (data: CheckVisibilityInput) =>
    fetcher<{ message: string }>("/api/ai-visibility/check", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteAICheck: (id: string) =>
    fetcher<void>(`/api/ai-visibility/${id}`, { method: "DELETE" }),

  // Admin
  getAdminStats: () => fetcher<AdminStats>("/api/admin/stats"),
  getAdminUsers: (params?: { search?: string; page?: number; role?: string; banned?: string }) => {
    const sp = new URLSearchParams()
    if (params?.search) sp.set("search", params.search)
    if (params?.page) sp.set("page", String(params.page))
    if (params?.role) sp.set("role", params.role)
    if (params?.banned !== undefined) sp.set("banned", params.banned)
    const qs = sp.toString()
    return fetcher<{ users: AdminUser[]; total: number; pages: number }>(`/api/admin/users${qs ? `?${qs}` : ""}`)
  },
  patchAdminUser: (id: string, data: { role?: string; isBanned?: boolean }) =>
    fetcher<AdminUser>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getAdminTenants: (params?: { plan?: string; suspended?: string; page?: number }) => {
    const sp = new URLSearchParams()
    if (params?.plan) sp.set("plan", params.plan)
    if (params?.suspended !== undefined) sp.set("suspended", params.suspended)
    if (params?.page) sp.set("page", String(params.page))
    const qs = sp.toString()
    return fetcher<{ tenants: AdminTenant[]; total: number; pages: number }>(`/api/admin/tenants${qs ? `?${qs}` : ""}`)
  },
  patchAdminTenant: (id: string, data: { plan?: string; isSuspended?: boolean; name?: string }) =>
    fetcher<{ id: string; name: string; plan: string; isSuspended: boolean }>(`/api/admin/tenants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  getAdminTenantDetail: (id: string) => fetcher<AdminTenantDetail>(`/api/admin/tenants/${id}`),
  getTenantFeatures: (id: string) =>
    fetcher<{ features: TenantFeatureResolved[] }>(`/api/admin/tenants/${id}/features`),
  setTenantFeature: (id: string, data: { feature: string; enabled: boolean; note?: string }) =>
    fetcher<unknown>(`/api/admin/tenants/${id}/features`, { method: "POST", body: JSON.stringify(data) }),
  deleteTenantFeature: (id: string, feature: string) =>
    fetcher<void>(`/api/admin/tenants/${id}/features/${feature}`, { method: "DELETE" }),
  getAdminPlans: () => fetcher<{ plans: PlanConfig[] }>("/api/admin/plans"),
  createAdminPlan: (data: Partial<PlanConfig>) =>
    fetcher<PlanConfig>("/api/admin/plans", { method: "POST", body: JSON.stringify(data) }),
  updateAdminPlan: (plan: string, data: Partial<PlanConfig>) =>
    fetcher<PlanConfig>(`/api/admin/plans/${plan}`, { method: "PUT", body: JSON.stringify(data) }),
  seedAdminPlans: () => fetcher<{ results: unknown[] }>("/api/admin/plans/seed", { method: "POST" }),

  // Google OAuth
  getGoogleStatus: () => fetcher<GoogleAccountStatus>("/api/google/status"),
  connectGoogle: () => {
    if (typeof window !== "undefined") {
      window.location.href = `${API_URL}/api/google/auth`
    }
  },
  disconnectGoogle: () => fetcher<{ success: boolean }>("/api/google/disconnect", { method: "POST" }),
  getGA4Data: (propertyId: string) => fetcher<GA4Data>(`/api/google/analytics?propertyId=${encodeURIComponent(propertyId)}`),
  getGSCData: (siteUrl: string) => fetcher<GSCData>(`/api/google/search-console?siteUrl=${encodeURIComponent(siteUrl)}`),
}

export interface BillingInfo {
  plan: "STARTER" | "PRO" | "AGENCY" | "ENTERPRISE"
  subscription: {
    status: string
    pagesQuota: number
    pagesUsed: number
    currentPeriodEnd: string | null
  } | null
  plans: PlanConfig[]
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
  googlePlaceId: string | null
  googleLocationName: string | null
  isGoogleConnected: boolean
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

export interface CreatePostInput {
  content: string
  type?: "UPDATE" | "EVENT" | "OFFER"
  ctaType?: string
  ctaUrl?: string
  scheduledAt?: string
}

export interface LocalRankingsData {
  rankings: GBPRanking[]
}

export interface CreateListingInput {
  businessName: string
  category: string
  address: string
  phone?: string
  website?: string
  lat?: number
  lng?: number
}

// ─── Types Rank Tracking ──────────────────────

export interface RankedKeyword {
  id: string
  keyword: string
  device: "desktop" | "mobile"
  country: string
  projectId: string | null
  position: number | null
  url: string | null
  title: string | null
  change: number | null // positif = monté, négatif = descendu
  checkedAt: string | null
  history: Array<{ position: number | null; checkedAt: string }>
}

export interface RankTrackingData {
  keywords: RankedKeyword[]
  stats: {
    tracked: number
    avgPosition: number | null
    top10: number
    top3: number
  }
}

export interface AddKeywordInput {
  keyword: string
  device?: "desktop" | "mobile"
  country?: string
  projectId?: string
}

// ─── Types Backlinks ──────────────────────────

export interface BacklinkItem {
  id: string
  sourceUrl: string
  sourceDomain: string
  targetUrl: string
  anchor: string | null
  dofollow: boolean
  domainRating: number | null
  firstSeen: string
  lastChecked: string
  isActive: boolean
}

export interface BacklinksData {
  items: BacklinkItem[]
  total: number
  page: number
  totalPages: number
  stats: {
    total: number
    uniqueDomains: number
    dofollow: number
    nofollow: number
    avgDomainRating: number
  }
}

export interface AddBacklinkInput {
  sourceUrl: string
  targetUrl: string
  anchor?: string
  dofollow?: boolean
  domainRating?: number
  projectId?: string
}

// ─── Types Competitors ────────────────────────

export interface CompetitorItem {
  id: string
  domain: string
  label: string | null
  createdAt: string
  isYou: boolean
  hasAudit: boolean
  scoreGlobal: number | null
  scoreTechnical: number | null
  scoreOnPage: number | null
  scorePerformance: number | null
  scoreUX: number | null
  totalIssues: number | null
  criticalIssues: number | null
  totalPages: number | null
  auditId: string | null
}

export interface OwnScore {
  scoreGlobal: number
  scoreTechnical: number
  scoreOnPage: number
  scorePerformance: number
  scoreUX: number
  totalIssues: number | null
  criticalIssues: number | null
  totalPages: number | null
  domain: string
}

export interface CompetitorsData {
  own: OwnScore | null
  competitors: CompetitorItem[]
  suggested: Array<{ domain: string; mentionCount: number }>
}

// ─── Types AI Visibility ──────────────────────

export interface AIVisibilityCheck {
  id: string
  query: string
  engine: string
  domain: string
  mentioned: boolean
  position: number | null
  snippet: string | null
  checkedAt: string
}

export interface AIVisibilityData {
  checks: AIVisibilityCheck[]
  stats: {
    total: number
    mentioned: number
    mentionRate: number
    avgPosition: number | null
    byEngine: Record<string, { total: number; mentioned: number }>
  }
}

export interface CheckVisibilityInput {
  domain: string
  queries: string[]
  engine?: "claude"
}

// ─── Types Google OAuth ───────────────────────

export interface GoogleAccountStatus {
  connected: boolean
  email: string | null
  scopes: string[]
  connectedAt: string | null
}

export interface GA4TimelineEntry {
  date: string
  sessions: number
  users: number
  pageviews: number
}

export interface GA4Data {
  sessions: number
  users: number
  pageviews: number
  bounceRate: number
  avgSessionDuration: number
  timeline: GA4TimelineEntry[]
}

export interface GSCQuery {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface GSCData {
  queries: GSCQuery[]
  totals: {
    clicks: number
    impressions: number
    avgPosition: number
  }
}

// ─── Types Admin ──────────────────────────────

export interface AdminStats {
  mrr: number
  tenantCount: number
  userCount: number
  auditsThisMonth: number
  planBreakdown: Record<string, number>
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: "ADMIN" | "MEMBER" | "GUEST"
  isBanned: boolean
  bannedAt: string | null
  tenantId: string | null
  createdAt: string
  tenant: { name: string; plan: string } | null
}

export interface AdminTenant {
  id: string
  name: string
  slug: string
  plan: string
  isSuspended: boolean
  createdAt: string
  userCount: number
  auditCount: number
  mrr: number
}

export interface AdminTenantDetail extends AdminTenant {
  projectCount: number
  suspendedAt: string | null
  subscription: {
    status: string
    stripeCustomerId: string
    stripeSubscriptionId: string | null
    currentPeriodEnd: string | null
  } | null
  features: TenantFeatureResolved[]
}

export interface TenantFeatureResolved {
  key: string
  label: string
  planDefault: boolean
  override: boolean | null
  enabled: boolean
}

export interface PlanConfig {
  id: string
  plan: string
  displayName: string
  price: number
  priceYearly: number | null
  stripePriceId: string | null
  stripePriceIdYearly: string | null
  auditQuota: number
  pageQuota: number
  projectQuota: number
  userQuota: number
  featureAI: boolean
  featureRankTracking: boolean
  featureLocalSeo: boolean
  featureWhiteLabel: boolean
  featureApiAccess: boolean
  featureCompetitors: boolean
  featureBacklinks: boolean
  isActive: boolean
  sortOrder: number
}
