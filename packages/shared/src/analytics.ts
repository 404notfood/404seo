import { normalizePageUrl } from "./actionPlan"
import type { AnalyticsPageMetric, AnalyticsSummary, AnalyticsComparison, AnalyticsQuality } from "./types/analytics.types"

/** GA4 landingPage is a path without query parameters. Collapse aliases before adding metrics. */
export function analyticsPageUrl(value: string): string | null {
  const normalized = normalizePageUrl(value)
  if (!normalized) return null
  const url = new URL(normalized)
  url.search = ""
  return url.href
}

export function summarizeAnalytics(rows: readonly AnalyticsPageMetric[]): AnalyticsSummary {
  return { sessions: rows.reduce((sum, row) => sum + row.sessions, 0), keyEvents: rows.reduce((sum, row) => sum + row.keyEvents, 0),
    purchaseRevenue: rows.some(row => row.purchaseRevenue === null) ? null : rows.reduce((sum, row) => sum + row.purchaseRevenue!, 0) }
}

export function analyticsExposure(expectedUrls: readonly string[], rows: readonly AnalyticsPageMetric[]) {
  const expected = [...new Set(expectedUrls.flatMap(url => { const key = analyticsPageUrl(url); return key ? [key] : [] }))]
  const metrics = new Map(rows.map(row => [analyticsPageUrl(row.pageUrl), row]))
  const matched = expected.flatMap(url => { const row = metrics.get(url); return row ? [row] : [] })
  return matched.length ? { ...summarizeAnalytics(matched), matchedPages: matched.length, expectedPages: expected.length } : null
}

export function compareAnalyticsPages(expectedUrls: readonly string[], beforeRows: readonly AnalyticsPageMetric[], afterRows: readonly AnalyticsPageMetric[]): AnalyticsComparison {
  const expected = [...new Set(expectedUrls.flatMap(url => { const key = analyticsPageUrl(url); return key ? [key] : [] }))]
  const before = new Map(beforeRows.map(row => [analyticsPageUrl(row.pageUrl), row]))
  const after = new Map(afterRows.map(row => [analyticsPageUrl(row.pageUrl), row]))
  const comparable = expected.filter(url => before.has(url) && after.has(url))
  const beforeSummary = comparable.length ? summarizeAnalytics(comparable.map(url => before.get(url)!)) : null
  const afterSummary = comparable.length ? summarizeAnalytics(comparable.map(url => after.get(url)!)) : null
  return { expectedPages: expected.length, comparablePages: comparable.length,
    missingBeforePages: expected.filter(url => !before.has(url)).length, missingAfterPages: expected.filter(url => !after.has(url)).length,
    comparableExamples: comparable.slice(0, 5), before: beforeSummary, after: afterSummary,
    changes: beforeSummary && afterSummary ? { sessions: afterSummary.sessions - beforeSummary.sessions,
      sessionsPercent: beforeSummary.sessions ? (afterSummary.sessions - beforeSummary.sessions) / beforeSummary.sessions * 100 : null,
      keyEvents: afterSummary.keyEvents - beforeSummary.keyEvents,
      purchaseRevenue: beforeSummary.purchaseRevenue === null || afterSummary.purchaseRevenue === null ? null : afterSummary.purchaseRevenue - beforeSummary.purchaseRevenue } : null }
}

export function mergeAnalyticsQuality(a: AnalyticsQuality, b: AnalyticsQuality): AnalyticsQuality {
  return { rowLimitReached: a.rowLimitReached || b.rowLimitReached, thresholded: a.thresholded || b.thresholded, sampled: a.sampled || b.sampled,
    otherRowLoss: a.otherRowLoss || b.otherRowLoss, truncated: a.truncated || b.truncated, revenueRestricted: a.revenueRestricted || b.revenueRestricted,
    metadataUnavailable: a.metadataUnavailable || b.metadataUnavailable, omittedRows: a.omittedRows + b.omittedRows,
    emptyReason: [a.emptyReason, b.emptyReason].filter(Boolean).join(" ; ") || null }
}
