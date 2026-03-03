import { chromium, Browser, BrowserContext } from "playwright"
import * as cheerio from "cheerio"
import { URL } from "url"
import type { PageData } from "@seo/shared"

export type { PageData }

// ─────────────────────────────────────────────
// Anti-SSRF
// ─────────────────────────────────────────────

const BLOCKED_HOSTS = [
  "localhost", "127.0.0.1", "0.0.0.0",
  "::1", "169.254.", "10.", "172.16.", "192.168.",
  "metadata.google.internal",
]

export function isValidPublicUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    if (!["http:", "https:"].includes(url.protocol)) return false
    const hostname = url.hostname.toLowerCase()
    return !BLOCKED_HOSTS.some(
      (blocked) => hostname === blocked || hostname.startsWith(blocked) || hostname.includes(blocked)
    )
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// Robots.txt
// ─────────────────────────────────────────────

async function isAllowedByRobots(pageUrl: string, userAgent: string): Promise<boolean> {
  try {
    const url = new URL(pageUrl)
    const robotsUrl = `${url.protocol}//${url.host}/robots.txt`
    const response = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return true

    const text = await response.text()
    const lines = text.split("\n")
    let applicable = false
    const disallowed: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.toLowerCase().startsWith("user-agent:")) {
        const agent = trimmed.split(":")[1].trim()
        applicable = agent === "*" || agent.toLowerCase() === userAgent.toLowerCase()
      }
      if (applicable && trimmed.toLowerCase().startsWith("disallow:")) {
        const path = trimmed.split(":").slice(1).join(":").trim()
        if (path) disallowed.push(path)
      }
    }

    return !disallowed.some((d) => url.pathname.startsWith(d))
  } catch {
    return true
  }
}

// ─────────────────────────────────────────────
// Parser HTML
// ─────────────────────────────────────────────

function parsePageContent(
  html: string,
  baseUrl: string
): Omit<PageData, "url" | "statusCode" | "responseTime" | "pageSize"> {
  const $ = cheerio.load(html)
  const parsedBase = new URL(baseUrl)

  const title = $("title").first().text().trim() || undefined
  const metaDescription = $('meta[name="description"]').attr("content")?.trim()

  const h1: string[] = []
  const h2: string[] = []
  const h3: string[] = []
  const h4: string[] = []
  $("h1").each((_, el) => { h1.push($(el).text().trim()) })
  $("h2").each((_, el) => { h2.push($(el).text().trim()) })
  $("h3").each((_, el) => { h3.push($(el).text().trim()) })
  $("h4").each((_, el) => { h4.push($(el).text().trim()) })

  const canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim()
  const metaRobots = $('meta[name="robots"]').attr("content")?.toLowerCase()
  const isIndexable = !metaRobots?.includes("noindex")

  const images: PageData["images"] = []
  $("img").each((_, el) => {
    const src = $(el).attr("src") || ""
    const alt = $(el).attr("alt")
    images.push({
      src,
      alt,
      hasAlt: alt !== undefined && alt !== "",
      width: $(el).attr("width") ? parseInt($(el).attr("width")!) : undefined,
      height: $(el).attr("height") ? parseInt($(el).attr("height")!) : undefined,
    })
  })

  const internalLinks: string[] = []
  const externalLinks: string[] = []
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return
    try {
      const linkUrl = new URL(href, baseUrl)
      if (linkUrl.hostname === parsedBase.hostname) {
        internalLinks.push(linkUrl.href)
      } else {
        externalLinks.push(linkUrl.href)
      }
    } catch { /* URL invalide */ }
  })

  const schemaOrgTypes: string[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text())
      const type = json["@type"]
      if (type) schemaOrgTypes.push(Array.isArray(type) ? type.join(",") : type)
    } catch { /* JSON invalide */ }
  })

  const hasViewport = $('meta[name="viewport"]').length > 0

  return {
    title,
    metaDescription,
    h1,
    headings: { h2, h3, h4 },
    canonicalUrl,
    metaRobots,
    isIndexable,
    images,
    internalLinks: [...new Set(internalLinks)],
    externalLinks: [...new Set(externalLinks)],
    schemaOrgTypes,
    hasViewport,
  }
}

// ─────────────────────────────────────────────
// SEOCrawler
// ─────────────────────────────────────────────

export type { CrawlOptions } from "@seo/shared"
import type { CrawlOptions } from "@seo/shared"

export class SEOCrawler {
  private browser: Browser | null = null
  private visitedUrls = new Set<string>()
  private options: Required<CrawlOptions>

  constructor(options: CrawlOptions = {}) {
    this.options = {
      maxPages: options.maxPages ?? 100,
      maxDepth: options.maxDepth ?? 5,
      timeout: options.timeout ?? 30000,
      userAgent: options.userAgent ?? "SEOAuditBot/1.0",
      respectRobots: options.respectRobots ?? true,
      device: options.device ?? "desktop",
    }
  }

  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    })
  }

  async close(): Promise<void> {
    await this.browser?.close()
    this.browser = null
  }

  async crawlPage(url: string): Promise<PageData> {
    if (!this.browser) throw new Error("Browser non initialisé. Appeler launch() d'abord.")
    if (!isValidPublicUrl(url)) throw new Error(`URL bloquée (SSRF): ${url}`)

    const context = await this.browser.newContext({
      userAgent: this.options.userAgent,
      viewport:
        this.options.device === "mobile"
          ? { width: 375, height: 812 }
          : { width: 1280, height: 800 },
    })

    const page = await context.newPage()
    const start = Date.now()

    try {
      const response = await page.goto(url, {
        waitUntil: "networkidle",
        timeout: this.options.timeout,
      })

      const responseTime = Date.now() - start
      const statusCode = response?.status() ?? 0
      const finalUrl = page.url()
      const redirectUrl = finalUrl !== url ? finalUrl : undefined
      const html = await page.content()
      const pageSize = Buffer.byteLength(html, "utf-8")
      const parsed = parsePageContent(html, finalUrl)

      return {
        url: finalUrl,
        statusCode,
        redirectUrl,
        responseTime,
        pageSize,
        rawHtml: html,
        ...parsed,
      }
    } catch (error) {
      return {
        url,
        statusCode: 0,
        responseTime: Date.now() - start,
        pageSize: 0,
        h1: [],
        headings: { h2: [], h3: [], h4: [] },
        isIndexable: false,
        images: [],
        internalLinks: [],
        externalLinks: [],
        schemaOrgTypes: [],
        hasViewport: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      await context.close()
    }
  }

  async crawlSite(
    startUrl: string,
    onProgress?: (crawled: number, total: number) => void
  ): Promise<PageData[]> {
    const results: PageData[] = []
    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }]

    while (queue.length > 0 && results.length < this.options.maxPages) {
      const { url, depth } = queue.shift()!

      if (this.visitedUrls.has(url)) continue
      this.visitedUrls.add(url)
      if (depth > this.options.maxDepth) continue

      if (this.options.respectRobots) {
        const allowed = await isAllowedByRobots(url, this.options.userAgent)
        if (!allowed) continue
      }

      const pageData = await this.crawlPage(url)
      results.push(pageData)
      onProgress?.(results.length, this.options.maxPages)

      if (depth < this.options.maxDepth) {
        const baseDomain = new URL(startUrl).hostname
        for (const link of pageData.internalLinks) {
          try {
            const linkDomain = new URL(link).hostname
            if (linkDomain === baseDomain && !this.visitedUrls.has(link)) {
              queue.push({ url: link, depth: depth + 1 })
            }
          } catch { /* URL invalide */ }
        }
      }

      await new Promise((r) => setTimeout(r, 500))
    }

    return results
  }
}
