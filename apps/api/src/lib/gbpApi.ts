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

export type { GBPAccount, GBPLocation, GBPReview, GBPLocalPost }
