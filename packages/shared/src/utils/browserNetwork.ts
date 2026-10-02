import { fetchPublicUrl } from "./publicUrl"

// Structural interface keeps shared independent of Playwright/Puppeteer.
interface BrowserRoute {
  request(): { url(): string; method(): string }
  abort(errorCode: "blockedbyclient"): Promise<void>
  fulfill(response: { status: number; headers: Record<string, string>; body: Buffer }): Promise<void>
}

export async function fulfillPublicRequest(route: BrowserRoute, userAgent?: string): Promise<string | null> {
  const request = route.request()
  if (request.method() !== "GET" && request.method() !== "HEAD") {
    await route.abort("blockedbyclient"); return null
  }
  try {
    const response = await fetchPublicUrl(request.url(), { userAgent, method: request.method() as "GET" | "HEAD", followRedirects: false })
    const headers = { ...response.headers }
    // Preserve redirects in Chromium so relative assets, canonical URLs and timings stay correct.
    // Each next hop is intercepted again and served through a validated, pinned socket.
    for (const key of ["transfer-encoding", "connection", "content-length", "set-cookie"]) delete headers[key]
    await route.fulfill({ status: response.status, headers, body: response.body })
    return response.url
  } catch {
    await route.abort("blockedbyclient").catch(() => {})
    return null
  }
}
