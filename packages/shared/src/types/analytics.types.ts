import type { SearchComparisonWindows } from "./searchInsights.types"

export interface AnalyticsStream { id: string; displayName: string; defaultUri: string }
export interface AnalyticsProperty { propertyId: string; displayName: string; timeZone: string; currencyCode: string; streams: AnalyticsStream[] }
export interface AnalyticsQuality {
  rowLimitReached: boolean
  thresholded: boolean
  sampled: boolean
  otherRowLoss: boolean
  truncated: boolean
  revenueRestricted: boolean
  metadataUnavailable: boolean
  omittedRows: number
  emptyReason: string | null
}
export interface AnalyticsSummary { sessions: number; keyEvents: number; purchaseRevenue: number | null }
export interface AnalyticsPageMetric extends AnalyticsSummary { pageUrl: string }
export interface AnalyticsReport { pages: AnalyticsPageMetric[]; quality: AnalyticsQuality }
export interface AnalyticsSnapshotInfo extends AnalyticsQuality {
  id: string; googleAccountId: string; propertyId: string; displayName: string; streamId: string
  timeZone: string; currencyCode: string; startDate: string; endDate: string; importedAt: string; stale: boolean
}
export interface AnalyticsActionExposure extends AnalyticsSummary { matchedPages: number; expectedPages: number; currencyCode: string; stale: boolean }
export interface AnalyticsComparison {
  expectedPages: number; comparablePages: number; missingBeforePages: number; missingAfterPages: number
  comparableExamples: string[]; before: AnalyticsSummary | null; after: AnalyticsSummary | null
  changes: { sessions: number; sessionsPercent: number | null; keyEvents: number; purchaseRevenue: number | null } | null
}
export interface AnalyticsMeasurement extends AnalyticsComparison, Omit<SearchComparisonWindows, "ready" | "readyOn" | "availableThrough"> {
  id: string; propertyId: string; streamId: string; timeZone: string; currencyCode: string; measuredAt: string
  quality: AnalyticsQuality
}
export interface ProjectAnalytics {
  snapshot: AnalyticsSnapshotInfo | null
  summary: AnalyticsSummary | null
  pages: AnalyticsPageMetric[]
  page: number; pageCount: number; total: number
  actions: { checkName: string; exposure: AnalyticsActionExposure | null; measurement: AnalyticsMeasurement | null }[]
}
