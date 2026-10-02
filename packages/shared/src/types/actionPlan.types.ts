import type { Category, CheckStatus, Effort, Priority } from "./index"

export type SeoActionStatus = "OPEN" | "IN_PROGRESS" | "IMPLEMENTED" | "VERIFIED" | "DISMISSED"

export interface ActionEvidence {
  pageUrl: string
  status: CheckStatus
  value: string | null
  expected: string | null
  message: string
}

export interface ActionPlanCheck extends ActionEvidence {
  checkName: string
  category: Category
  priority: Priority
  effort: Effort
}

export interface SearchConsolePageMetric {
  pageUrl: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SeoActionItem {
  checkName: string
  title: string
  category: Category
  priority: Priority
  effort: Effort
  priorityScore: number
  reason: string
  confidence: "AUDIT_ONLY" | "PARTIAL_GSC" | "GSC_MATCHED"
  affectedPages: number
  failCount: number
  warnCount: number
  evidence: ActionEvidence[]
  search: { matchedPages: number; clicks: number; impressions: number; ctr: number; position: number } | null
  status: SeoActionStatus
  note: string
  implementedAt: string | null
  verifiedAt: string | null
  verifiedAuditId: string | null
}

export interface ActionPlan {
  audit: { id: string; completedAt: string | null; pageCount: number } | null
  searchConsole: {
    propertyUrl: string
    googleAccountId: string
    importedAt: string
    startDate: string
    endDate: string
    pageCount: number
    rowLimitReached: boolean
    stale: boolean
  } | null
  actions: SeoActionItem[]
}

export interface SearchConsoleProperty {
  siteUrl: string
  permissionLevel: string
}

export interface ActionVerification {
  verified: string[]
  pending: { checkName: string; reason: string }[]
  reopened: string[]
}
