import type { SearchConsolePageMetric } from "./actionPlan.types"

export interface SearchConsoleQueryMetric extends SearchConsolePageMetric { query: string }

export interface SearchMetricSummary {
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

export interface SearchQueryInsight extends SearchMetricSummary {
  query: string
  pageCount: number
  pages: SearchConsolePageMetric[]
  opportunity: { referenceCtr: number; sampleCount: number; positionBand: string; reason: string; signalScore: number } | null
  overlap: { reason: string; competingPages: number } | null
}

export type SearchInsightMode = "all" | "opportunities" | "overlap"

export interface SearchInsights {
  snapshot: { propertyUrl: string; startDate: string; endDate: string; importedAt: string; queriesIncluded: boolean; rowLimitReached: boolean; stale: boolean } | null
  summary: { queryCount: number; opportunityCount: number; overlapCount: number }
  items: SearchQueryInsight[]
  page: number
  pageCount: number
  total: number
}

export interface SearchComparisonWindows {
  windowDays: 7 | 28
  beforeStartDate: string
  beforeEndDate: string
  afterStartDate: string
  afterEndDate: string
  readyOn: string
  availableThrough: string
  ready: boolean
}

export interface SearchComparisonResult {
  expectedPages: number
  comparablePages: number
  missingBeforePages: number
  missingAfterPages: number
  comparableExamples: string[]
  before: SearchMetricSummary | null
  after: SearchMetricSummary | null
  changes: { clicks: number; clicksPercent: number | null; impressions: number; impressionsPercent: number | null; ctrPoints: number | null; position: number | null } | null
}

export interface SeoActionMeasurement extends SearchComparisonResult {
  id: string
  propertyUrl: string
  windowDays: 7 | 28
  beforeStartDate: string
  beforeEndDate: string
  afterStartDate: string
  afterEndDate: string
  measuredAt: string
  rowLimitReached: boolean
}
