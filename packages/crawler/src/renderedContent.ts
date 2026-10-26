import type { Page, Request } from "playwright"

/** Observe before navigation so delayed scripts and data requests remain visible. */
export function observeRendering(page: Page): { wait(timeoutMs?: number): Promise<void>; dispose(): void } {
  const pending = new Set<Request>()
  const started = (request: Request) => {
    if (["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) pending.add(request)
  }
  const finished = (request: Request) => { pending.delete(request) }
  page.on("request", started)
  page.on("requestfinished", finished)
  page.on("requestfailed", finished)
  return {
    async wait(timeoutMs = 8000) {
      const start = Date.now()
      let lastChange = start
      let previous = ""
      while (Date.now() - start < timeoutMs) {
        const snapshot = await page.evaluate(() => ({
          text: (document.body?.innerText ?? "").slice(0, 100_000).trim(),
          signature: JSON.stringify([
            document.title,
            Array.from(document.querySelectorAll('meta, link[rel="canonical"], script[type="application/ld+json"]')).map(el => el.outerHTML).join(""),
            document.querySelectorAll("h1, h2, h3, a[href], img").length,
            (document.body?.innerText ?? "").slice(0, 100_000),
          ]),
          busy: !!document.querySelector('[aria-busy="true"]'),
        }))
        const now = Date.now()
        if (snapshot.signature !== previous || pending.size > 0 || snapshot.busy) lastChange = now
        previous = snapshot.signature
        // Never require a title/H1: their genuine absence is an audit finding.
        // Empty SPA shells get the full budget; normal pages finish once settled.
        if (snapshot.text && now - start >= 1500 && now - lastChange >= 750) return
        await new Promise<void>(resolve => setTimeout(resolve, 200))
      }
    },
    dispose() {
      page.off("request", started)
      page.off("requestfinished", finished)
      page.off("requestfailed", finished)
    },
  }
}
