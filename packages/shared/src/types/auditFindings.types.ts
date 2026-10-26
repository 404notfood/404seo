import type { Category, CheckResult, CheckStatus } from "./index"

/** A check with its source page, when available (including older audits). */
export interface AuditCheckOccurrence extends Omit<CheckResult, "value" | "expected"> {
  id?: string
  pageId?: string
  pageUrl?: string
  value?: string | null
  expected?: string | null
}

export interface AuditFinding {
  key: string
  category: Category
  checkName: string
  status: CheckStatus
  priority: CheckResult["priority"]
  effort: CheckResult["effort"]
  /** Mean score across the checked pages, not a replacement for audit scoring. */
  score: number
  affectedCount: number
  checkedCount: number
  failCount: number
  warnCount: number
  passCount: number
  hasPageContext: boolean
  /** Distinct evidence; complementary messages on one affected page are preserved. */
  occurrences: AuditCheckOccurrence[]
}
