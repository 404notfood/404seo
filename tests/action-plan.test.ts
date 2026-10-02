import { test } from "node:test"
import assert from "node:assert/strict"
import { buildActionItems, correctionVerification, impactEffortScore, normalizePageUrl } from "../packages/shared/src/actionPlan"
import type { ActionPlanCheck } from "../packages/shared/src/types/actionPlan.types"
import { pageBelongsToProject, propertyCoversProject, searchConsoleWindow } from "../apps/api/src/lib/searchConsole"

function check(overrides: Partial<ActionPlanCheck> = {}): ActionPlanCheck {
  return { checkName: "title", pageUrl: "https://example.com/a", category: "ON_PAGE", priority: "HIGH", effort: "LOW", status: "FAIL", value: "", expected: "Un titre descriptif", message: "Titre absent", ...overrides }
}

test("priorities favor lower effort and remain within the report scale", () => {
  assert.equal(impactEffortScore("HIGH", "LOW"), 10)
  assert.ok(impactEffortScore("HIGH", "LOW") > impactEffortScore("HIGH", "HIGH"))
  const items = buildActionItems([check(), check({ checkName: "canonical", effort: "HIGH" })], [])
  assert.equal(items[0].checkName, "title")
  assert.equal(items[0].confidence, "AUDIT_ONLY")
  assert.equal(items[0].search, null, "missing data does not pretend to be zero traffic")
})

test("count each affected URL once, with failures taking precedence over warnings", () => {
  const [item] = buildActionItems([check({ status: "WARN" }), check(), check({ pageUrl: "https://example.com/a#section" }), check({ pageUrl: "https://example.com/b", status: "PASS" })], [])
  assert.equal(item.affectedPages, 1)
  assert.equal(item.failCount, 1)
  assert.equal(item.warnCount, 0)
  assert.equal(item.evidence[0].expected, "Un titre descriptif")
})

test("only matching Google pages inform priority and averages are impression weighted", () => {
  const metrics = [
    { pageUrl: "https://example.com/a", impressions: 100, clicks: 10, ctr: 0.1, position: 2 },
    { pageUrl: "https://example.com/b", impressions: 300, clicks: 15, ctr: 0.05, position: 10 },
    { pageUrl: "https://example.com/other", impressions: 1_000_000, clicks: 5, ctr: 0.000005, position: 1 },
  ]
  const [item] = buildActionItems([check(), check({ pageUrl: "https://example.com/b" })], metrics)
  assert.equal(item.search?.impressions, 400)
  assert.equal(item.search?.ctr, 25 / 400)
  assert.equal(item.search?.position, 8)
  assert.equal(item.confidence, "GSC_MATCHED")
  assert.equal(item.evidence[0].pageUrl, "https://example.com/b")
  assert.equal(buildActionItems([check(), check({ pageUrl: "https://example.com/missing" })], metrics)[0].confidence, "PARTIAL_GSC")
  assert.ok(item.priorityScore > buildActionItems([check(), check({ pageUrl: "https://example.com/b" })], [])[0].priorityScore)
})

test("a missing check or missing crawled page never proves a correction", () => {
  const urls = ["https://example.com/a", "https://example.com/b"]
  assert.match(correctionVerification("title", urls, [])!, /pas été contrôlées/)
  assert.match(correctionVerification("title", urls, [check({ status: "PASS" })])!, /pas été contrôlées/)
  assert.match(correctionVerification("title", urls, [check({ status: "PASS" }), check({ pageUrl: urls[1], status: "WARN" })])!, /encore ce problème/)
  assert.equal(correctionVerification("title", urls, [check({ status: "PASS" }), check({ pageUrl: urls[1], status: "PASS" })]), null)
})

test("GSC properties and imported pages respect domain label and path boundaries", () => {
  assert.equal(propertyCoversProject("sc-domain:example.com", "https://shop.example.com/"), true)
  assert.equal(propertyCoversProject("sc-domain:example.com", "https://evil-example.com/"), false)
  assert.equal(propertyCoversProject("https://example.com/blog", "https://example.com/blogger"), false)
  assert.equal(propertyCoversProject("https://example.com/", "https://example.com/blog/"), true)
  assert.equal(pageBelongsToProject("https://other.example.com/a", "https://example.com/"), false)
  assert.equal(pageBelongsToProject("https://example.com/blogger", "https://example.com/blog"), false)
  assert.equal(pageBelongsToProject("https://example.com/blog/a", "https://example.com/blog"), true)
  assert.equal(normalizePageUrl("javascript:alert(1)"), null)
  assert.equal(normalizePageUrl("https://user:pass@example.com"), null)
  assert.equal(normalizePageUrl("https://example.com/?page=2"), "https://example.com/?page=2", "semantic query parameters are preserved")
})

test("28-day imports use the Pacific calendar across month and daylight-saving boundaries", () => {
  assert.deepEqual(searchConsoleWindow(new Date("2026-10-02T01:00:00Z")), { startDate: "2026-09-01", endDate: "2026-09-28" })
  assert.deepEqual(searchConsoleWindow(new Date("2026-03-10T01:00:00Z")), { startDate: "2026-02-07", endDate: "2026-03-06" })
})
