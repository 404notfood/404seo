import { fetchPublicUrl } from "./publicUrl"

// Structural interface keeps shared independent of Playwright/Puppeteer.
interface BrowserRoute {
  request(): { url(): string; method(): string }
  abort(errorCode: "blockedbyclient"): Promise<void>
  fulfill(response: { status: number; headers: Record<string, string>; body: Buffer }): Promise<void>
}

export async function fulfillPublicRequest(route: BrowserRoute, userAgent?: string, onResolved?: (url: string) => void): Promise<string | null> {
  const request = route.request()
  if (request.method() !== "GET" && request.method() !== "HEAD") {
    await route.abort("blockedbyclient"); return null
  }
  try {
    // Chromium does not intercept subsequent hops after a fulfilled 3xx. Follow
    // them in the pinned client, which validates DNS and each redirect target.
    const response = await fetchPublicUrl(request.url(), { userAgent, method: request.method() as "GET" | "HEAD" })
    const headers = { ...response.headers }
    for (const key of ["transfer-encoding", "connection", "content-length", "set-cookie"]) delete headers[key]
    onResolved?.(response.url)
    await route.fulfill({ status: response.status, headers, body: response.body })
    return response.url
  } catch {
    await route.abort("blockedbyclient").catch(() => {})
    return null
  }
}
