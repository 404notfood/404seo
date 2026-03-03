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

  // Projects
  getProjects: () => fetcher<Project[]>("/api/projects"),
  createProject: (data: CreateProjectInput) =>
    fetcher<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    fetcher<void>(`/api/projects/${id}`, { method: "DELETE" }),
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
  pages: Array<{ id: string; url: string; statusCode: number | null; results: PageResult[] }>
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
