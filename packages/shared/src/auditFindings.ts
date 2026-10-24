import type { AuditCheckOccurrence, AuditFinding } from "./types/auditFindings.types"

const STATUS_ORDER = { FAIL: 0, WARN: 1, PASS: 2 }
const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 }

function compareChecks(a: AuditCheckOccurrence, b: AuditCheckOccurrence): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    || a.score - b.score
}

/** Group a remediation family, retaining distinct page evidence and mixed statuses. */
export function groupAuditFindings(results: readonly AuditCheckOccurrence[]): AuditFinding[] {
  const groups = new Map<string, Map<string, AuditCheckOccurrence[]>>()
  results.forEach((original, index) => {
    // Older audits assessed missing ALT twice, under two different categories.
    // Only alias the legacy ALT-only rule; image format/weight checks stay distinct.
    const result = original.checkName === "image_optimization" && /\bALT\b/i.test(`${original.message} ${original.expected ?? ""}`)
      ? { ...original, category: "ON_PAGE" as const, checkName: "images_alt" } : original
    const key = `${result.category}:${result.checkName}`
    let pages = groups.get(key)
    if (!pages) { pages = new Map(); groups.set(key, pages) }
    // URL first: two crawl records for the same URL must not inflate coverage.
    // Preserve query strings: filtered/paginated URLs may have different findings.
    const source = result.pageUrl ? `url:${result.pageUrl}`
      : result.pageId ? `page:${result.pageId}` : `observation:${index}`
    const existing = pages.get(source)
    if (!existing) pages.set(source, [result])
    else if (!existing.some(check => check.status === result.status && check.score === result.score
      && check.message === result.message && check.value === result.value && check.expected === result.expected
      && check.priority === result.priority && check.effort === result.effort)) existing.push(result)
  })

  const findings: AuditFinding[] = []
  for (const [key, pages] of groups) {
    const representatives = [...pages.values()].map(checks => [...checks].sort(compareChecks)[0]).sort(compareChecks)
    const occurrences = [...pages.values()].flatMap(checks => {
      const worst = [...checks].sort(compareChecks)[0]
      return worst.status === "PASS" ? [worst] : checks.filter(check => check.status !== "PASS")
    }).sort(compareChecks)
    const first = representatives[0]
    const failCount = representatives.filter(check => check.status === "FAIL").length
    const warnCount = representatives.filter(check => check.status === "WARN").length
    findings.push({
      key, category: first.category, checkName: first.checkName,
      status: first.status, priority: first.priority, effort: first.effort,
      score: Math.round(representatives.reduce((sum, check) => sum + check.score, 0) / representatives.length),
      failCount, warnCount, passCount: representatives.length - failCount - warnCount,
      affectedCount: failCount + warnCount, checkedCount: representatives.length,
      hasPageContext: representatives.every(check => Boolean(check.pageUrl || check.pageId)),
      occurrences,
    })
  }
  return findings.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    || b.affectedCount - a.affectedCount || a.key.localeCompare(b.key))
}

export function isCriticalFinding(finding: AuditFinding): boolean {
  return finding.status === "FAIL" && finding.priority === "HIGH"
}

export function findingCoverageLabel(finding: AuditFinding): string {
  const count = finding.status === "PASS" ? finding.checkedCount : finding.affectedCount
  return finding.hasPageContext
    ? `${count} / ${finding.checkedCount} page${finding.checkedCount > 1 ? "s" : ""}`
    : `${count} constat${count > 1 ? "s" : ""}`
}
