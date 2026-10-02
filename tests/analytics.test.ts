import { test } from "node:test"
import assert from "node:assert/strict"
import { analyticsExposure, analyticsPageUrl, compareAnalyticsPages, mergeAnalyticsQuality, summarizeAnalytics } from "../packages/shared/src/analytics"
import { searchComparisonWindows } from "../packages/shared/src/searchInsights"
import { matchingAnalyticsStreams, parseAnalyticsReport } from "../apps/api/src/lib/analytics"
import type { AnalyticsProperty } from "../packages/shared/src/types/analytics.types"

const property: AnalyticsProperty = { propertyId: "properties/123", displayName: "Example", timeZone: "Europe/Paris", currencyCode: "EUR",
  streams: [{ id: "456", displayName: "Web", defaultUri: "https://example.com/" }, { id: "789", displayName: "Foreign", defaultUri: "https://example.com.evil.test/" }] }
const report = () => ({ dimensionHeaders: [{ name: "hostName" }, { name: "landingPage" }], metricHeaders: [{ name: "sessions" }, { name: "keyEvents" }, { name: "purchaseRevenue" }],
  metadata: { timeZone: "Europe/Paris", currencyCode: "EUR" }, rowCount: 1,
  rows: [{ dimensionValues: [{ value: "example.com" }, { value: "/a" }], metricValues: [{ value: "100" }, { value: "3.5" }, { value: "-29.99" }] }] })

test("GA4 parsing preserves fractional key events and net negative revenue, while isolating the host", () => {
  const input = report()
  input.rows.push({ dimensionValues: [{ value: "other.example.com" }, { value: "/a" }], metricValues: [{ value: "500" }, { value: "40" }, { value: "9999" }] })
  input.rows.push({ dimensionValues: [{ value: "example.com" }, { value: "//evil.test/" }], metricValues: [] })
  const parsed = parseAnalyticsReport(input, property, "https://example.com/")
  assert.equal(parsed.pages.length, 1)
  assert.equal(parsed.pages[0].keyEvents, 3.5)
  assert.equal(parsed.pages[0].purchaseRevenue, -29.99)
  assert.equal(parsed.quality.omittedRows, 2)
  assert.equal(matchingAnalyticsStreams(property, "https://example.com/shop/").length, 1)
  assert.equal(matchingAnalyticsStreams(property, "https://foreign.example.com/").length, 0)
})

test("GA4 provider failures and changed settings cannot become successful zero metrics", () => {
  const malformed = report(); malformed.rows[0].metricValues[1].value = "NaN"
  assert.throws(() => parseAnalyticsReport(malformed, property, "https://example.com/"), /Invalid GA4 metric/)
  const missing = report(); missing.rows[0].metricValues.pop()
  assert.throws(() => parseAnalyticsReport(missing, property, "https://example.com/"), /Invalid GA4 metric/)
  const currency = report(); currency.metadata.currencyCode = "USD"
  assert.throws(() => parseAnalyticsReport(currency, property, "https://example.com/"), /settings changed/)
  const zone = report(); zone.metadata.timeZone = "Asia/Tokyo"
  assert.throws(() => parseAnalyticsReport(zone, property, "https://example.com/"), /settings changed/)
  const duplicate = report(); duplicate.rows.push(duplicate.rows[0])
  assert.throws(() => parseAnalyticsReport(duplicate, property, "https://example.com/"), /Duplicate/)
})

test("GA4 restrictions, sampling and incomplete reports remain explicit and revenue stays unavailable", () => {
  const input = { ...report(), rowCount: 10, metadata: { ...report().metadata, subjectToThresholding: true, dataLossFromOtherRow: true,
    dataTruncationReasons: [{ reason: "limit" }], samplingMetadatas: [{ samplesReadCount: "9007199254740992", samplingSpaceSize: "9007199254740993" }],
    schemaRestrictionResponse: { activeMetricRestrictions: [{ metricName: "purchaseRevenue", restrictedMetricTypes: ["REVENUE_DATA"] }] } } }
  const parsed = parseAnalyticsReport(input, property, "https://example.com/")
  assert.equal(parsed.pages[0].purchaseRevenue, null)
  for (const flag of ["rowLimitReached", "thresholded", "sampled", "otherRowLoss", "truncated", "revenueRestricted"] as const) assert.equal(parsed.quality[flag], true)
  const other = parseAnalyticsReport(report(), property, "https://example.com/").quality
  assert.equal(mergeAnalyticsQuality(parsed.quality, other).revenueRestricted, true)
  const unavailable = parseAnalyticsReport({ ...report(), rows: [], metadata: { emptyReason: "NO_DATA" } }, property, "https://example.com/")
  assert.equal(unavailable.quality.emptyReason, "NO_DATA")
})

test("GA4 landing paths collapse URL parameters and do not duplicate action exposure", () => {
  assert.equal(analyticsPageUrl("https://example.com/a?utm_source=mail#part"), "https://example.com/a")
  assert.equal(analyticsPageUrl("javascript:alert(1)"), null)
  const page = { pageUrl: "https://example.com/a", sessions: 100, keyEvents: 10, purchaseRevenue: 50 }
  const exposure = analyticsExposure(["https://example.com/a?x=1", "https://example.com/a?x=2", "https://example.com/b"], [page])!
  assert.equal(exposure.expectedPages, 2)
  assert.equal(exposure.matchedPages, 1)
  assert.equal(exposure.sessions, 100)
  assert.equal(analyticsExposure(["https://example.com/b"], [page]), null)
})

test("GA4 comparison uses identical observed paths; missing rows and restricted revenue are unknown", () => {
  const before = [{ pageUrl: "https://example.com/a", sessions: 100, keyEvents: 10, purchaseRevenue: null }, { pageUrl: "https://example.com/b", sessions: 1000, keyEvents: 100, purchaseRevenue: 900 }]
  const after = [{ pageUrl: "https://example.com/a", sessions: 150, keyEvents: 14.5, purchaseRevenue: 500 }]
  const result = compareAnalyticsPages(["https://example.com/a?x=1", "https://example.com/b"], before, after)
  assert.equal(result.missingAfterPages, 1)
  assert.equal(result.before!.sessions, 100)
  assert.equal(result.changes!.sessionsPercent, 50)
  assert.equal(result.changes!.keyEvents, 4.5)
  assert.equal(result.changes!.purchaseRevenue, null)
  assert.equal(summarizeAnalytics(before).purchaseRevenue, null)
  assert.equal(compareAnalyticsPages(["https://example.com/a"], before, []).changes, null)
})

test("GA4 comparisons do not invent growth from a zero baseline", () => {
  const result = compareAnalyticsPages(["https://example.com/a"], [{ pageUrl: "https://example.com/a", sessions: 0, keyEvents: 0, purchaseRevenue: 0 }], [{ pageUrl: "https://example.com/a", sessions: 100, keyEvents: 10, purchaseRevenue: -50 }])
  assert.equal(result.changes!.sessionsPercent, null)
  assert.equal(result.changes!.purchaseRevenue, -50)
})

test("GA4 calendar follows the property timezone, including day boundaries and daylight saving", () => {
  const correction = new Date("2026-03-29T22:30:00Z")
  const paris = searchComparisonWindows(correction, 7, new Date("2026-04-09T22:30:00Z"), "Europe/Paris")
  const pacific = searchComparisonWindows(correction, 7, new Date("2026-04-09T22:30:00Z"))
  assert.equal(paris.beforeEndDate, "2026-03-29")
  assert.equal(paris.afterStartDate, "2026-03-31")
  assert.equal(paris.readyOn, "2026-04-09")
  assert.equal(paris.ready, true)
  assert.equal(pacific.beforeEndDate, "2026-03-28")
})
