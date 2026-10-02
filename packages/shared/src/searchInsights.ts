import { normalizePageUrl } from "./actionPlan"
import type { SearchConsolePageMetric } from "./types/actionPlan.types"
import type { SearchComparisonResult, SearchComparisonWindows, SearchConsoleQueryMetric, SearchMetricSummary, SearchQueryInsight } from "./types/searchInsights.types"

export function googleCalendarDate(value: Date, timeZone = "America/Los_Angeles"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value)
  const part = (name: string) => parts.find(item => item.type === name)!.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function searchComparisonWindows(implementedAt: Date, windowDays: 7 | 28, now = new Date(), timeZone = "America/Los_Angeles"): SearchComparisonWindows {
  const day = googleCalendarDate(implementedAt, timeZone)
  const beforeEndDate = shiftCalendarDate(day, -1)
  const afterEndDate = shiftCalendarDate(day, windowDays)
  const availableThrough = shiftCalendarDate(googleCalendarDate(now, timeZone), -3)
  return { windowDays, beforeStartDate: shiftCalendarDate(day, -windowDays), beforeEndDate,
    afterStartDate: shiftCalendarDate(day, 1), afterEndDate, readyOn: shiftCalendarDate(afterEndDate, 3), availableThrough,
    ready: availableThrough >= afterEndDate }
}

export function normalizeSearchQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("fr-FR")
}

export function summarizeSearchMetrics(rows: readonly SearchConsolePageMetric[]): SearchMetricSummary {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  return { clicks, impressions, ctr: impressions ? clicks / impressions : null,
    position: impressions ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : null }
}

function positionBand(position: number | null): string {
  if (position === null || position < 1) return "unknown"
  return position <= 3 ? "1–3" : position <= 10 ? "4–10" : position <= 20 ? "11–20" : "21+"
}

/** Page-level impressions are summed, not unique search events or market search volume. */
export function buildSearchQueryInsights(rows: readonly SearchConsoleQueryMetric[]): SearchQueryInsight[] {
  const groups = new Map<string, Map<string, SearchConsolePageMetric>>()
  const observedRows = new Set<string>()
  for (const row of rows) {
    const query = normalizeSearchQuery(row.query)
    const pageUrl = normalizePageUrl(row.pageUrl)
    if (!query || !pageUrl || row.impressions <= 0) continue
    const observation = `${row.query}\0${pageUrl}`
    if (observedRows.has(observation)) continue
    observedRows.add(observation)
    const pages = groups.get(query) ?? new Map<string, SearchConsolePageMetric>()
    const previous = pages.get(pageUrl)
    if (!previous) pages.set(pageUrl, { ...row, pageUrl })
    else {
      const impressions = previous.impressions + row.impressions
      const clicks = previous.clicks + row.clicks
      pages.set(pageUrl, { pageUrl, impressions, clicks, ctr: clicks / impressions,
        position: (previous.position * previous.impressions + row.position * row.impressions) / impressions })
    }
    groups.set(query, pages)
  }
  const items: SearchQueryInsight[] = [...groups].map(([query, pages]) => {
    const allPages = [...pages.values()].sort((a, b) => b.impressions - a.impressions || a.pageUrl.localeCompare(b.pageUrl))
    const summary = summarizeSearchMetrics(allPages)
    const contenders = allPages.filter(page => page.impressions >= 20 && page.position >= 1 && page.position <= 20)
    const leader = contenders[0]
    const competing = leader ? contenders.filter(page => page.impressions / summary.impressions >= 0.2 && Math.abs(page.position - leader.position) <= 5) : []
    return { ...summary, query, pageCount: allPages.length, pages: allPages.slice(0, 5), opportunity: null,
      overlap: summary.impressions >= 100 && competing.length >= 2 ? { competingPages: competing.length,
        reason: `${competing.length} URLs reçoivent chacune au moins 20 % des impressions de leurs pages et leurs positions moyennes sont proches. Vérifiez si elles répondent à la même intention ; plusieurs résultats ne prouvent pas une cannibalisation.` } : null }
  })
  const samples = new Map<string, number[]>()
  for (const item of items) {
    if (item.impressions < 100 || item.ctr === null) continue
    const band = positionBand(item.position)
    const values = samples.get(band) ?? []
    values.push(item.ctr)
    samples.set(band, values)
  }
  const references = new Map<string, { ctr: number; count: number }>()
  for (const [band, values] of samples) {
    if (values.length < 10) continue
    values.sort((a, b) => a - b)
    const middle = Math.floor(values.length / 2)
    const ctr = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
    references.set(band, { ctr, count: values.length })
  }
  for (const item of items) {
    const band = positionBand(item.position)
    const reference = references.get(band)
    if (!reference || item.position === null || item.position < 4 || item.position > 20 || item.impressions < 100 || item.ctr === null || item.ctr >= reference.ctr * 0.75) continue
    item.opportunity = { referenceCtr: reference.ctr, sampleCount: reference.count, positionBand: band,
      signalScore: (reference.ctr - item.ctr) * item.impressions,
      reason: `CTR inférieur à 75 % de la médiane de ${reference.count} requêtes de cet import dans la tranche ${band}. Comparez les intentions et les extraits de résultats avant d’ajuster le titre ou la description.` }
  }
  return items.sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
}

/** Missing rows are unknown; compare only URLs observed in BOTH windows. */
export function compareSearchPages(expectedUrls: readonly string[], beforeRows: readonly SearchConsolePageMetric[], afterRows: readonly SearchConsolePageMetric[]): SearchComparisonResult {
  const expected = [...new Set(expectedUrls.flatMap(url => { const normalized = normalizePageUrl(url); return normalized ? [normalized] : [] }))]
  const before = new Map(beforeRows.map(row => [normalizePageUrl(row.pageUrl), row]))
  const after = new Map(afterRows.map(row => [normalizePageUrl(row.pageUrl), row]))
  const comparable = expected.filter(url => before.has(url) && after.has(url))
  const beforeSummary = comparable.length ? summarizeSearchMetrics(comparable.map(url => before.get(url)!)) : null
  const afterSummary = comparable.length ? summarizeSearchMetrics(comparable.map(url => after.get(url)!)) : null
  return { expectedPages: expected.length, comparablePages: comparable.length,
    missingBeforePages: expected.filter(url => !before.has(url)).length, missingAfterPages: expected.filter(url => !after.has(url)).length,
    comparableExamples: comparable.slice(0, 5), before: beforeSummary, after: afterSummary,
    changes: beforeSummary && afterSummary ? {
      clicks: afterSummary.clicks - beforeSummary.clicks,
      clicksPercent: beforeSummary.clicks ? (afterSummary.clicks - beforeSummary.clicks) / beforeSummary.clicks * 100 : null,
      impressions: afterSummary.impressions - beforeSummary.impressions,
      impressionsPercent: beforeSummary.impressions ? (afterSummary.impressions - beforeSummary.impressions) / beforeSummary.impressions * 100 : null,
      ctrPoints: beforeSummary.ctr === null || afterSummary.ctr === null ? null : (afterSummary.ctr - beforeSummary.ctr) * 100,
      position: beforeSummary.position === null || afterSummary.position === null ? null : afterSummary.position - beforeSummary.position,
    } : null }
}
