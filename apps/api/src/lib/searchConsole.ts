import { google } from "googleapis"
import type { SearchConsolePageMetric, SearchConsoleProperty, SearchConsoleQueryMetric } from "@seo/shared"
import { googleCalendarDate, shiftCalendarDate, normalizePageUrl } from "@seo/shared"
import { getAuthenticatedClient } from "./googleOAuth"

export interface SearchConsoleProvider {
  listProperties(tenantId: string, accountId: string): Promise<SearchConsoleProperty[]>
  fetchPages(tenantId: string, accountId: string, propertyUrl: string, startDate: string, endDate: string): Promise<{ pages: SearchConsolePageMetric[]; rowLimitReached: boolean }>
  fetchQueryPages(tenantId: string, accountId: string, propertyUrl: string, startDate: string, endDate: string): Promise<{ pages: SearchConsoleQueryMetric[]; rowLimitReached: boolean }>
}

export const searchConsoleProvider: SearchConsoleProvider = {
  async listProperties(tenantId, accountId) {
    const auth = await getAuthenticatedClient(tenantId, accountId)
    const api = google.searchconsole({ version: "v1", auth })
    const response = await api.sites.list({}, { timeout: 20_000, retry: false })
    return (response.data.siteEntry ?? []).flatMap(site => site.siteUrl && site.permissionLevel && site.permissionLevel !== "siteUnverifiedUser"
      ? [{ siteUrl: site.siteUrl, permissionLevel: site.permissionLevel }] : [])
  },
  async fetchPages(tenantId, accountId, propertyUrl, startDate, endDate) {
    const auth = await getAuthenticatedClient(tenantId, accountId)
    const api = google.searchconsole({ version: "v1", auth })
    const response = await api.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: { startDate, endDate, dimensions: ["page"], type: "web", dataState: "final", rowLimit: 25_000, aggregationType: "byPage" },
    }, { timeout: 30_000, retry: false })
    const rows = response.data.rows ?? []
    const pages = rows.flatMap(row => {
      const pageUrl = normalizePageUrl(row.keys?.[0] ?? "")
      const { clicks, impressions, ctr, position } = row
      if (!pageUrl || pageUrl.length > 2048 || ![clicks, impressions, ctr, position].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
        || clicks! > impressions! || ctr! > 1) return []
      return [{ pageUrl, clicks: clicks!, impressions: impressions!, ctr: ctr!, position: position! }]
    })
    return { pages, rowLimitReached: rows.length >= 25_000 }
  },
  async fetchQueryPages(tenantId, accountId, propertyUrl, startDate, endDate) {
    const auth = await getAuthenticatedClient(tenantId, accountId)
    const api = google.searchconsole({ version: "v1", auth })
    const response = await api.searchanalytics.query({
      siteUrl: propertyUrl,
      requestBody: { startDate, endDate, dimensions: ["query", "page"], type: "web", dataState: "final", rowLimit: 25_000, aggregationType: "byPage" },
    }, { timeout: 30_000, retry: false })
    const rows = response.data.rows ?? []
    const pages = rows.flatMap(row => {
      const query = row.keys?.[0]?.trim()
      const pageUrl = normalizePageUrl(row.keys?.[1] ?? "")
      const { clicks, impressions, ctr, position } = row
      if (!query || query.length > 2048 || !pageUrl || pageUrl.length > 2048
        || ![clicks, impressions, ctr, position].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
        || clicks! > impressions! || ctr! > 1) return []
      return [{ query, pageUrl, clicks: clicks!, impressions: impressions!, ctr: ctr!, position: position! }]
    })
    return { pages, rowLimitReached: rows.length >= 25_000 }
  },
}

/** Dates use Search Console's Pacific calendar. Delay three days and request finalized data. */
export function searchConsoleWindow(now = new Date()): { startDate: string; endDate: string } {
  const endDate = shiftCalendarDate(googleCalendarDate(now), -3)
  return { startDate: shiftCalendarDate(endDate, -27), endDate }
}

export function propertyCoversProject(propertyUrl: string, domain: string): boolean {
  try {
    const project = new URL(domain)
    if (propertyUrl.startsWith("sc-domain:")) {
      const host = propertyUrl.slice(10).toLowerCase()
      return /^[a-z0-9.-]+$/.test(host) && (project.hostname === host || project.hostname.endsWith(`.${host}`))
    }
    const property = new URL(propertyUrl)
    const prefix = property.pathname.endsWith("/") ? property.pathname : `${property.pathname}/`
    return property.origin === project.origin && (project.pathname === property.pathname || project.pathname.startsWith(prefix))
  } catch { return false }
}

/** A domain property can contain other subdomains: keep only this project's origin and path. */
export function pageBelongsToProject(pageUrl: string, domain: string): boolean {
  try {
    const page = new URL(pageUrl)
    const project = new URL(domain)
    const path = project.pathname.endsWith("/") ? project.pathname : `${project.pathname}/`
    return page.origin === project.origin && (project.pathname === "/" || page.pathname === project.pathname || page.pathname.startsWith(path))
  } catch { return false }
}
