// lib/gbpApi.ts — Google Business Profile API helpers (v1 + v4.9 legacy)
// v1 APIs: accounts, locations (mybusinessaccountmanagement, mybusinessbusinessinformation)
// Legacy v4.9: reviews, localPosts (mybusiness.googleapis.com)

import type { Auth } from "googleapis"

// ─── Types ──────────────────────────────────────────────────────────────────

interface GBPAccount {
  name: string // "accounts/123456789"
  accountName?: string
  type?: string
}

interface GBPLocation {
  name: string // "locations/123456789"
  title?: string
  storefrontAddress?: {
    addressLines?: string[]
    locality?: string
    postalCode?: string
    regionCode?: string
  }
  phoneNumbers?: { primaryPhone?: string }
  websiteUri?: string
  primaryCategory?: { displayName?: string }
}

interface GBPReview {
  name: string // "accounts/x/locations/y/reviews/z"
  reviewId: string
  reviewer: { displayName?: string; profilePhotoUrl?: string }
  starRating: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE"
  comment?: string
  createTime: string
  updateTime: string
  reviewReply?: { comment: string; updateTime: string }
}

interface GBPLocalPost {
  name: string // "accounts/x/locations/y/localPosts/z"
  summary?: string
  topicType?: string
  state?: string
  createTime: string
  updateTime: string
  callToAction?: { actionType?: string; url?: string }
  media?: Array<{ mediaFormat?: string; googleUrl?: string }>
  searchUrl?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getAccessToken(auth: Auth.OAuth2Client): Promise<string> {
  const { token } = await auth.getAccessToken()
  if (!token) throw new Error("Impossible d'obtenir un access token Google")
  return token
}

async function gbpFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`GBP API ${res.status}: ${body.slice(0, 500)}`)
  }

  if (res.status === 204) return {} as T
  return res.json() as Promise<T>
}

// ─── Accounts & Locations (v1 APIs) ─────────────────────────────────────────

export async function listAccounts(auth: Auth.OAuth2Client): Promise<GBPAccount[]> {
  const token = await getAccessToken(auth)
  const allAccounts: GBPAccount[] = []
  let pageToken: string | undefined

  do {
    const qs = new URLSearchParams({ pageSize: "20" })
    if (pageToken) qs.set("pageToken", pageToken)

    const data = await gbpFetch<{ accounts?: GBPAccount[]; nextPageToken?: string }>(
      `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?${qs}`,
      token,
    )
    if (data.accounts) allAccounts.push(...data.accounts)
    pageToken = data.nextPageToken
  } while (pageToken)

  return allAccounts
}

export async function listLocations(auth: Auth.OAuth2Client, accountName: string): Promise<GBPLocation[]> {
  const token = await getAccessToken(auth)
  const allLocations: GBPLocation[] = []
  let pageToken: string | undefined

  do {
    const qs = new URLSearchParams({
      pageSize: "100",
      readMask: "name,title,storefrontAddress,phoneNumbers,websiteUri,primaryCategory",
    })
    if (pageToken) qs.set("pageToken", pageToken)

    const data = await gbpFetch<{ locations?: GBPLocation[]; nextPageToken?: string }>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${qs}`,
      token,
    )
    if (data.locations) allLocations.push(...data.locations)
    pageToken = data.nextPageToken
  } while (pageToken)

  return allLocations
}

// ─── Reviews (legacy v4.9) ──────────────────────────────────────────────────

export async function listReviews(auth: Auth.OAuth2Client, accountName: string, locationName: string): Promise<GBPReview[]> {
  const token = await getAccessToken(auth)
  const allReviews: GBPReview[] = []
  let pageToken: string | undefined

  // locationName = "locations/123" → need "accounts/xxx/locations/123"
  const fullName = `${accountName}/${locationName}`

  do {
    const qs = new URLSearchParams({ pageSize: "50" })
    if (pageToken) qs.set("pageToken", pageToken)

    const data = await gbpFetch<{ reviews?: GBPReview[]; nextPageToken?: string; totalReviewCount?: number }>(
      `https://mybusiness.googleapis.com/v4/${fullName}/reviews?${qs}`,
      token,
    )
    if (data.reviews) allReviews.push(...data.reviews)
    pageToken = data.nextPageToken
  } while (pageToken)

  return allReviews
}

export async function replyToReview(
  auth: Auth.OAuth2Client,
  reviewName: string, // "accounts/x/locations/y/reviews/z"
  comment: string,
): Promise<void> {
  const token = await getAccessToken(auth)
  await gbpFetch(
    `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
    token,
    {
      method: "PUT",
      body: JSON.stringify({ comment }),
    },
  )
}

export async function deleteReviewReply(auth: Auth.OAuth2Client, reviewName: string): Promise<void> {
  const token = await getAccessToken(auth)
  await gbpFetch(
    `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
    token,
    { method: "DELETE" },
  )
}

// ─── Local Posts (legacy v4.9) ──────────────────────────────────────────────

export async function listLocalPosts(auth: Auth.OAuth2Client, accountName: string, locationName: string): Promise<GBPLocalPost[]> {
  const token = await getAccessToken(auth)
  const allPosts: GBPLocalPost[] = []
  let pageToken: string | undefined

  const fullName = `${accountName}/${locationName}`

  do {
    const qs = new URLSearchParams({ pageSize: "100" })
    if (pageToken) qs.set("pageToken", pageToken)

    const data = await gbpFetch<{ localPosts?: GBPLocalPost[]; nextPageToken?: string }>(
      `https://mybusiness.googleapis.com/v4/${fullName}/localPosts?${qs}`,
      token,
    )
    if (data.localPosts) allPosts.push(...data.localPosts)
    pageToken = data.nextPageToken
  } while (pageToken)

  return allPosts
}

export async function createLocalPost(
  auth: Auth.OAuth2Client,
  accountName: string,
  locationName: string,
  post: {
    summary: string
    topicType?: string
    callToAction?: { actionType: string; url: string }
    media?: Array<{ mediaFormat: string; sourceUrl: string }>
  },
): Promise<GBPLocalPost> {
  const token = await getAccessToken(auth)
  const fullName = `${accountName}/${locationName}`

  return gbpFetch<GBPLocalPost>(
    `https://mybusiness.googleapis.com/v4/${fullName}/localPosts`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        languageCode: "fr",
        summary: post.summary,
        topicType: post.topicType || "STANDARD",
        ...(post.callToAction ? { callToAction: post.callToAction } : {}),
        ...(post.media ? { media: post.media } : {}),
      }),
    },
  )
}

export async function deleteLocalPost(auth: Auth.OAuth2Client, postName: string): Promise<void> {
  const token = await getAccessToken(auth)
  await gbpFetch(
    `https://mybusiness.googleapis.com/v4/${postName}`,
    token,
    { method: "DELETE" },
  )
}

// ─── Star rating conversion ────────────────────────────────────────────────

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  STAR_RATING_UNSPECIFIED: 0,
}

export function starRatingToNumber(rating: string): number {
  return STAR_MAP[rating] ?? 0
}

// ─── Sentiment analysis (simple heuristic) ─────────────────────────────────

export function detectSentiment(rating: number, text?: string | null): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  if (rating >= 4) return "POSITIVE"
  if (rating <= 2) return "NEGATIVE"
  return "NEUTRAL"
}

// ─── Performance API v1 (businessprofileperformance.googleapis.com) ─────

type DailyMetric =
  | "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"
  | "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"
  | "BUSINESS_IMPRESSIONS_MOBILE_MAPS"
  | "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"
  | "BUSINESS_DIRECTION_REQUESTS"
  | "CALL_CLICKS"
  | "WEBSITE_CLICKS"
  | "BUSINESS_BOOKINGS"
  | "BUSINESS_FOOD_ORDERS"
  | "BUSINESS_CONVERSATIONS"

interface DateProto { year: number; month: number; day: number }

interface DatedValue {
  date: DateProto
  value?: string // stringified number
}

interface TimeSeries {
  datedValues?: DatedValue[]
}

interface MultiDailyMetricTimeSeries {
  dailyMetric?: string
  timeSeries?: TimeSeries
}

interface FetchMultiDailyMetricsResponse {
  multiDailyMetricTimeSeries?: MultiDailyMetricTimeSeries[]
}

interface SearchKeywordCount {
  searchKeyword?: string
  insightsValue?: { value?: string; threshold?: string }
}

interface ListSearchKeywordsResponse {
  searchKeywordsCounts?: SearchKeywordCount[]
  nextPageToken?: string
}

/**
 * Fetch multiple daily performance metrics for a location over a date range.
 * Uses the Business Profile Performance API v1.
 */
export async function fetchPerformanceMetrics(
  auth: Auth.OAuth2Client,
  locationId: string, // "locations/123456789"
  metrics: DailyMetric[],
  startDate: DateProto,
  endDate: DateProto,
): Promise<{ metric: string; data: Array<{ date: string; value: number }> }[]> {
  const token = await getAccessToken(auth)

  const qs = new URLSearchParams()
  for (const m of metrics) qs.append("dailyMetrics", m)
  qs.set("dailyRange.startDate.year", String(startDate.year))
  qs.set("dailyRange.startDate.month", String(startDate.month))
  qs.set("dailyRange.startDate.day", String(startDate.day))
  qs.set("dailyRange.endDate.year", String(endDate.year))
  qs.set("dailyRange.endDate.month", String(endDate.month))
  qs.set("dailyRange.endDate.day", String(endDate.day))

  const res = await gbpFetch<FetchMultiDailyMetricsResponse>(
    `https://businessprofileperformance.googleapis.com/v1/${locationId}:fetchMultiDailyMetricsTimeSeries?${qs}`,
    token,
  )

  return (res.multiDailyMetricTimeSeries ?? []).map((ts) => ({
    metric: ts.dailyMetric ?? "UNKNOWN",
    data: (ts.timeSeries?.datedValues ?? []).map((dv) => ({
      date: `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}-${String(dv.date.day).padStart(2, "0")}`,
      value: parseInt(dv.value ?? "0"),
    })),
  }))
}

/**
 * Fetch search keywords that led users to discover the business (monthly impressions).
 */
export async function fetchSearchKeywords(
  auth: Auth.OAuth2Client,
  locationId: string, // "locations/123456789"
  startMonth: DateProto,
  endMonth: DateProto,
  pageSize = 100,
): Promise<{ keyword: string; impressions: number }[]> {
  const token = await getAccessToken(auth)
  const allKeywords: { keyword: string; impressions: number }[] = []
  let pageToken: string | undefined

  do {
    const qs = new URLSearchParams({ pageSize: String(pageSize) })
    qs.set("monthlyRange.startMonth.year", String(startMonth.year))
    qs.set("monthlyRange.startMonth.month", String(startMonth.month))
    qs.set("monthlyRange.startMonth.day", "1")
    qs.set("monthlyRange.endMonth.year", String(endMonth.year))
    qs.set("monthlyRange.endMonth.month", String(endMonth.month))
    qs.set("monthlyRange.endMonth.day", "1")
    if (pageToken) qs.set("pageToken", pageToken)

    const data = await gbpFetch<ListSearchKeywordsResponse>(
      `https://businessprofileperformance.googleapis.com/v1/${locationId}/searchkeywords/impressions/monthly?${qs}`,
      token,
    )

    for (const kw of data.searchKeywordsCounts ?? []) {
      if (kw.searchKeyword) {
        allKeywords.push({
          keyword: kw.searchKeyword,
          impressions: parseInt(kw.insightsValue?.value ?? "0"),
        })
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return allKeywords
}

export type { GBPAccount, GBPLocation, GBPReview, GBPLocalPost, DailyMetric, DateProto }
