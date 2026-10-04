import { test } from "node:test"
import assert from "node:assert/strict"
import { buildSearchQueryInsights, compareSearchPages, normalizeSearchQuery, searchComparisonWindows } from "../packages/shared/src/searchInsights"
import type { SearchConsoleQueryMetric } from "../packages/shared/src/types/searchInsights.types"

function row(overrides: Partial<SearchConsoleQueryMetric> = {}): SearchConsoleQueryMetric {
  return { query: "chaussures rouges", pageUrl: "https://example.com/a", impressions: 1000, clicks: 10, ctr: 0.01, position: 6, ...overrides }
}

test("CTR opportunities need project evidence; no generic benchmark when the sample is small", () => {
  const peers = Array.from({ length: 9 }, (_, index) => row({ query: `requête ${index}`, pageUrl: `https://example.com/${index}`, clicks: 50, ctr: 0.05 }))
  assert.equal(buildSearchQueryInsights([row(), ...peers.slice(0, 8)])[0].opportunity, null)
  const insights = buildSearchQueryInsights([row(), ...peers])
  const opportunity = insights.find(item => item.query === "chaussures rouges")!.opportunity!
  assert.equal(opportunity.referenceCtr, 0.05)
  assert.equal(opportunity.sampleCount, 10)
  assert.equal(opportunity.positionBand, "4–10")
  assert.equal(insights.filter(item => item.opportunity).length, 1)
  assert.equal(buildSearchQueryInsights([row({ position: 25 }), ...peers]).find(item => item.query === "chaussures rouges")!.opportunity, null)
})

test("multiple URLs alone are not a cannibalization signal", () => {
  assert.equal(buildSearchQueryInsights([row(), row({ pageUrl: "https://example.com/b", impressions: 10, clicks: 1 })])[0].overlap, null)
  assert.equal(buildSearchQueryInsights([row(), row({ pageUrl: "https://example.com/b", position: 19 })])[0].overlap, null)
  const result = buildSearchQueryInsights([row(), row({ pageUrl: "https://example.com/b", position: 8 })])[0]
  assert.equal(result.overlap?.competingPages, 2)
  assert.match(result.overlap!.reason, /ne prouvent pas une cannibalisation/)
})

test("query variants are aggregated, exact duplicate observations do not double traffic", () => {
  const first = row({ query: "CAFÉ SEO", clicks: 5, impressions: 100, position: 5 })
  const second = row({ query: "café seo", clicks: 10, impressions: 100, position: 7 })
  const [insight] = buildSearchQueryInsights([first, second, first])
  assert.equal(insight.query, "café seo")
  assert.equal(insight.pageCount, 1)
  assert.equal(insight.impressions, 200)
  assert.equal(insight.clicks, 15)
  assert.equal(insight.position, 6)
  assert.equal(insight.ctr, 0.075)
  assert.equal(normalizeSearchQuery("  CAFÉ\n SEO  "), "café seo")
  assert.notEqual(normalizeSearchQuery("cafe"), normalizeSearchQuery("café"), "accents are not silently merged")
})

test("before/after comparisons keep identical URLs and never substitute missing data with zero", () => {
  const before = [row({ clicks: 10, impressions: 100, position: 7 }), row({ pageUrl: "https://example.com/b", clicks: 1000, impressions: 10000 })]
  const after = [row({ clicks: 25, impressions: 200, position: 5 }), row({ pageUrl: "https://example.com/other", clicks: 5000, impressions: 100000 })]
  const compared = compareSearchPages(["https://example.com/a", "https://example.com/b"], before, after)
  assert.equal(compared.comparablePages, 1)
  assert.equal(compared.missingAfterPages, 1)
  assert.equal(compared.before?.clicks, 10)
  assert.equal(compared.after?.clicks, 25)
  assert.equal(compared.changes?.clicksPercent, 150)
  assert.equal(compared.changes?.position, -2)
  const absent = compareSearchPages(["https://example.com/a"], [], after)
  assert.equal(absent.before, null)
  assert.equal(absent.after, null)
  assert.equal(absent.changes, null)
})

test("zero baselines do not invent infinite growth or a CTR without impressions", () => {
  const compared = compareSearchPages(["https://example.com/a"], [row({ clicks: 0, impressions: 0, position: 0 })], [row()])
  assert.equal(compared.changes?.clicksPercent, null)
  assert.equal(compared.before?.ctr, null)
  assert.equal(compared.before?.position, null)
  assert.equal(compared.changes?.ctrPoints, null)
})

test("comparison windows exclude the correction day, use Pacific dates and wait for full periods", () => {
  const implemented = new Date("2026-09-02T01:00:00Z") // September 1 in Pacific time
  const beforeReady = searchComparisonWindows(implemented, 7, new Date("2026-09-11T01:00:00Z"))
  assert.equal(beforeReady.beforeStartDate, "2026-08-25")
  assert.equal(beforeReady.beforeEndDate, "2026-08-31")
  assert.equal(beforeReady.afterStartDate, "2026-09-02")
  assert.equal(beforeReady.afterEndDate, "2026-09-08")
  assert.equal(beforeReady.readyOn, "2026-09-11")
  assert.equal(beforeReady.ready, false)
  assert.equal(searchComparisonWindows(implemented, 7, new Date("2026-09-11T12:00:00Z")).ready, true)
  const long = searchComparisonWindows(implemented, 28, new Date("2026-10-02T12:00:00Z"))
  assert.equal(long.beforeStartDate, "2026-08-04")
  assert.equal(long.afterEndDate, "2026-09-29")
  assert.equal(long.ready, true)
})
