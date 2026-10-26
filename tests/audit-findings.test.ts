import { test } from "node:test"
import assert from "node:assert/strict"
import { findingCoverageLabel, groupAuditFindings, isCriticalFinding } from "../packages/shared/src/auditFindings"
import type { AuditCheckOccurrence } from "../packages/shared/src/types/auditFindings.types"
import { calculateGlobalScore, generateRecommendations } from "../packages/scorer/src/index"
import { generateReportHTML } from "../packages/reporter/src/reportTemplate"

const check = (overrides: Partial<AuditCheckOccurrence> = {}): AuditCheckOccurrence => ({
  category: "ON_PAGE", checkName: "title", status: "FAIL", score: 0,
  priority: "HIGH", effort: "LOW", message: "Titre absent", ...overrides,
})

test("100 pages produce one finding with complete mixed-status evidence and exact coverage", () => {
  const checks = Array.from({ length: 100 }, (_, index) => check({
    pageUrl: `https://example.com/page-${index}`, pageId: `page-${index}`,
    status: index < 40 ? "FAIL" : "PASS", score: index < 40 ? 0 : 100,
    message: index < 40 ? "Titre absent" : "Titre présent", value: `Valeur ${index}`,
  }))
  const original = structuredClone(checks)
  const [finding] = groupAuditFindings(checks)
  assert.equal(groupAuditFindings(checks).length, 1)
  assert.equal(finding.affectedCount, 40)
  assert.equal(finding.checkedCount, 100)
  assert.equal(finding.passCount, 60)
  assert.equal(finding.score, 60)
  assert.equal(finding.occurrences.length, 100)
  assert.equal(findingCoverageLabel(finding), "40 / 100 pages")
  assert.deepEqual(checks, original)
})

test("duplicate crawl records do not inflate coverage; query variants and categories stay distinct", () => {
  const findings = groupAuditFindings([
    check({ pageId: "a", pageUrl: "https://example.com/", status: "PASS", score: 100 }),
    check({ pageId: "b", pageUrl: "https://example.com/", value: "Missing" }),
    check({ pageUrl: "https://example.com/?page=2", value: "Too short" }),
    check({ category: "TECHNICAL", pageUrl: "https://example.com/" }),
  ])
  assert.equal(findings.length, 2)
  const title = findings.find(finding => finding.category === "ON_PAGE")!
  assert.equal(title.checkedCount, 2)
  assert.equal(title.failCount, 2)
  assert.deepEqual(new Set(title.occurrences.map(row => row.value)), new Set(["Missing", "Too short"]))
})

test("the priority of a warning cannot turn a lower-priority failure into a critical finding", () => {
  const [finding] = groupAuditFindings([
    check({ pageId: "a", status: "WARN", priority: "HIGH" }),
    check({ pageId: "b", status: "FAIL", priority: "LOW" }),
    check({ pageId: "c", status: "PASS", score: 100, priority: "HIGH" }),
  ])
  assert.equal(finding.priority, "LOW")
  assert.equal(isCriticalFinding(finding), false)
  assert.equal(finding.affectedCount, 2)
})

test("legacy results without source URLs are labelled as observations, not invented page counts", () => {
  const [finding] = groupAuditFindings([check(), check()])
  assert.equal(finding.hasPageContext, false)
  assert.equal(findingCoverageLabel(finding), "2 constats")
  assert.deepEqual(groupAuditFindings([]), [])
})

test("legacy ALT checks are consolidated per page without merging real image optimization or losing evidence", () => {
  const pageUrl = "https://example.com/"
  const findings = groupAuditFindings([
    check({ pageUrl, checkName: "images_alt", message: "7 images sans ALT", value: "7 images" }),
    check({ pageUrl, category: "PERFORMANCE", checkName: "image_optimization", message: "Seulement 42% des images ont un ALT", value: "42%" }),
    check({ pageUrl, category: "PERFORMANCE", checkName: "image_optimization", message: "Images trop lourdes", value: "2 Mo" }),
  ])
  const alt = findings.find(finding => finding.checkName === "images_alt")!
  assert.equal(findings.length, 2)
  assert.equal(alt.affectedCount, 1)
  assert.equal(alt.checkedCount, 1)
  assert.equal(alt.occurrences.length, 2)
  assert.deepEqual(alt.occurrences.map(check => check.value), ["7 images", "42%"])
})

test("the action plan contains distinct remediation families rather than repeating the top ten", () => {
  const score = calculateGlobalScore({ technical: [], onPage: Array.from({ length: 100 }, () => check()), performance: [], uxMobile: [] })
  const recs = generateRecommendations(score)
  assert.equal(recs.length, 1)
  assert.equal(recs[0].checkName, "title")
  assert.equal(score.criticalIssues.length, 100)
})

test("PDF presentation stays bounded, shows coverage and escapes untrusted report fields", () => {
  const checks = Array.from({ length: 100 }, (_, index) => check({ pageUrl: `https://example.com/page-${index}`, value: '<script>alert("value")</script>' }))
  const score = calculateGlobalScore({ technical: [], onPage: checks, performance: [], uxMobile: [] })
  const html = generateReportHTML({
    url: "https://example.com/", date: "24 octobre 2026", score: { ...score, summary: "<script>summary</script>" },
    recommendations: generateRecommendations(score), checks, totalPages: 100,
    tenantBranding: { name: "<script>brand</script>", logoUrl: "http://127.0.0.1/private", brandColor: "red;}body{display:none}" },
  })
  assert.equal((html.match(/class="finding"/g) ?? []).length, 1)
  assert.ok(html.includes("100 / 100 pages"))
  assert.ok(html.includes("&lt;script&gt;brand&lt;/script&gt;"))
  assert.ok(html.includes("&lt;script&gt;summary&lt;/script&gt;"))
  assert.ok(!html.includes("<script>"))
  assert.ok(!html.includes("127.0.0.1"))
  assert.ok(!html.includes("red;}"))
  assert.ok(html.length < 20000)
})
