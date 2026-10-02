import { google } from "googleapis"
import { z } from "zod"
import { analyticsPageUrl } from "@seo/shared"
import type { AnalyticsProperty, AnalyticsReport, AnalyticsQuality } from "@seo/shared"
import { getAuthenticatedClient } from "./googleOAuth"
import { pageBelongsToProject, propertyCoversProject } from "./searchConsole"

export const AnalyticsQualitySchema = z.object({ rowLimitReached: z.boolean(), thresholded: z.boolean(), sampled: z.boolean(),
  otherRowLoss: z.boolean(), truncated: z.boolean(), revenueRestricted: z.boolean(), metadataUnavailable: z.boolean(), omittedRows: z.number().int().nonnegative(), emptyReason: z.string().max(1000).nullable() })
export const AnalyticsPropertySchema = z.object({ propertyId: z.string().regex(/^properties\/[0-9]{1,20}$/), displayName: z.string().max(255),
  timeZone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return !!value } catch { return false } }),
  currencyCode: z.string().regex(/^[A-Z]{3}$/), streams: z.array(z.object({ id: z.string().regex(/^[0-9]{1,20}$/), displayName: z.string().max(255), defaultUri: z.string().max(2048) })).max(200) })

export interface AnalyticsProvider {
  getProperty(tenantId: string, accountId: string, propertyId: string): Promise<AnalyticsProperty>
  fetchPages(tenantId: string, accountId: string, property: AnalyticsProperty, streamId: string, domain: string, startDate: string, endDate: string): Promise<AnalyticsReport>
}

const ReportSchema = z.object({
  dimensionHeaders: z.array(z.object({ name: z.string() })), metricHeaders: z.array(z.object({ name: z.string() })),
  rows: z.array(z.object({ dimensionValues: z.array(z.object({ value: z.string().optional() })).optional(), metricValues: z.array(z.object({ value: z.string().optional() })).optional() })).max(10_000).optional(),
  rowCount: z.number().int().nonnegative().optional(),
  metadata: z.object({ currencyCode: z.string().nullable().optional(), timeZone: z.string().nullable().optional(),
    emptyReason: z.string().max(500).nullable().optional(),
    subjectToThresholding: z.boolean().nullable().optional(), dataLossFromOtherRow: z.boolean().nullable().optional(),
    dataTruncationReasons: z.array(z.unknown()).optional(),
    samplingMetadatas: z.array(z.object({ samplesReadCount: z.string().nullable().optional(), samplingSpaceSize: z.string().nullable().optional() })).optional(),
    schemaRestrictionResponse: z.object({ activeMetricRestrictions: z.array(z.object({ metricName: z.string().nullable().optional(), restrictedMetricTypes: z.array(z.string()).nullable().optional() })).optional() }).optional(),
  }).optional(),
})

/** Reject malformed or inconsistent responses rather than turn a provider failure into zero revenue. */
export function parseAnalyticsReport(input: unknown, property: AnalyticsProperty, domain: string): AnalyticsReport {
  const report = ReportSchema.parse(input)
  if (report.dimensionHeaders.map(item => item.name).join(",") !== "hostName,landingPage" || report.metricHeaders.map(item => item.name).join(",") !== "sessions,keyEvents,purchaseRevenue") throw new Error("Unexpected GA4 headers")
  const metadata = report.metadata
  if ((metadata?.currencyCode && metadata.currencyCode !== property.currencyCode) || (metadata?.timeZone && metadata.timeZone !== property.timeZone)) throw new Error("GA4 property settings changed")
  const rows = report.rows ?? []
  const revenueRestricted = !!metadata?.schemaRestrictionResponse?.activeMetricRestrictions?.some(item => item.metricName === "purchaseRevenue" || item.restrictedMetricTypes?.includes("REVENUE_DATA"))
  const quality: AnalyticsQuality = { rowLimitReached: (report.rowCount ?? rows.length) > rows.length || rows.length >= 10_000,
    thresholded: metadata?.subjectToThresholding ?? false, otherRowLoss: metadata?.dataLossFromOtherRow ?? false,
    truncated: !!metadata?.dataTruncationReasons?.length, revenueRestricted, metadataUnavailable: !metadata, omittedRows: 0, emptyReason: metadata?.emptyReason || null,
    sampled: !!metadata?.samplingMetadatas?.some(item => {
      const read = item.samplesReadCount; const space = item.samplingSpaceSize
      return !read || !space || !/^\d{1,30}$/.test(read) || !/^\d{1,30}$/.test(space) || BigInt(read) < BigInt(space)
    }) }
  const project = new URL(domain)
  const pages = rows.flatMap(row => {
    const host = row.dimensionValues?.[0]?.value
    const path = row.dimensionValues?.[1]?.value
    if (!path || !path.startsWith("/") || path.startsWith("//") || host !== project.hostname) { quality.omittedRows++; return [] }
    const pageUrl = analyticsPageUrl(new URL(path, project.origin).href)
    if (!pageUrl || pageUrl.length > 2048 || !pageBelongsToProject(pageUrl, domain)) { quality.omittedRows++; return [] }
    const values = row.metricValues?.map(item => item.value && item.value.trim() ? Number(item.value) : NaN) ?? []
    if (values.length !== 3 || !values.every(Number.isFinite) || values[0] < 0 || values[1] < 0) throw new Error("Invalid GA4 metric")
    return [{ pageUrl, sessions: values[0], keyEvents: values[1], purchaseRevenue: revenueRestricted ? null : values[2] }]
  })
  if (new Set(pages.map(page => page.pageUrl)).size !== pages.length) throw new Error("Duplicate GA4 landing pages")
  return { pages, quality }
}

export function matchingAnalyticsStreams(property: AnalyticsProperty, domain: string) {
  return property.streams.filter(stream => propertyCoversProject(stream.defaultUri, domain))
}

export const analyticsProvider: AnalyticsProvider = {
  async getProperty(tenantId, accountId, propertyId) {
    const auth = await getAuthenticatedClient(tenantId, accountId)
    const admin = google.analyticsadmin({ version: "v1beta", auth })
    const [property, streams] = await Promise.all([
      admin.properties.get({ name: propertyId }, { timeout: 20_000, retry: false }),
      admin.properties.dataStreams.list({ parent: propertyId, pageSize: 200 }, { timeout: 20_000, retry: false }),
    ])
    if (streams.data.nextPageToken) throw new Error("Too many GA4 streams")
    return AnalyticsPropertySchema.parse({ propertyId: property.data.name, displayName: property.data.displayName, timeZone: property.data.timeZone, currencyCode: property.data.currencyCode,
      streams: (streams.data.dataStreams ?? []).flatMap(stream => stream.type === "WEB_DATA_STREAM" && stream.webStreamData?.defaultUri && stream.name
        ? [{ id: stream.name.split("/").at(-1), displayName: stream.displayName ?? stream.name, defaultUri: stream.webStreamData.defaultUri }] : []) })
  },
  async fetchPages(tenantId, accountId, property, streamId, domain, startDate, endDate) {
    const auth = await getAuthenticatedClient(tenantId, accountId)
    const api = google.analyticsdata({ version: "v1beta", auth })
    const response = await api.properties.runReport({ property: property.propertyId, requestBody: {
      dateRanges: [{ startDate, endDate }], dimensions: [{ name: "hostName" }, { name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }, { name: "purchaseRevenue" }], currencyCode: property.currencyCode,
      dimensionFilter: { andGroup: { expressions: [
        { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: true } } },
        { filter: { fieldName: "streamId", stringFilter: { matchType: "EXACT", value: streamId, caseSensitive: true } } },
        { filter: { fieldName: "hostName", stringFilter: { matchType: "EXACT", value: new URL(domain).hostname, caseSensitive: true } } },
      ] } }, limit: "10000", orderBys: [{ metric: { metricName: "sessions" }, desc: true }], keepEmptyRows: false,
    } }, { timeout: 30_000, retry: false })
    return parseAnalyticsReport(response.data, property, domain)
  },
}
