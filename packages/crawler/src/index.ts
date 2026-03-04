import { chromium, Browser, BrowserContext } from "playwright"
import * as cheerio from "cheerio"
import { URL } from "url"
import type { PageData } from "@seo/shared"
import { extractPageKeywords } from "@seo/shared"

export type { PageData }

// ─────────────────────────────────────────────
// Anti-SSRF
// ─────────────────────────────────────────────

const BLOCKED_HOSTS = [
  "localhost", "127.0.0.1", "0.0.0.0",
  "::1", "169.254.", "10.", "172.16.", "192.168.",
  "metadata.google.internal",
]

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost"]

export function isValidPublicUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    if (!["http:", "https:"].includes(url.protocol)) return false
    const hostname = url.hostname.toLowerCase()

    // Block known internal hostnames
    if (BLOCKED_HOSTS.some(
      (blocked) => hostname === blocked || hostname.startsWith(blocked) || hostname.includes(blocked)
    )) return false

    // Block .local, .internal, .localhost TLDs
    if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return false

    // Block IPv6 mapped IPv4 (::ffff:127.0.0.1)
    if (hostname.startsWith("[") || hostname.includes("::ffff:")) return false

    // Block IPv6 private ranges (fc00::/7 → fc/fd prefix)
    if (/^f[cd][0-9a-f]{2}:/.test(hostname)) return false

    // Block hex/octal/decimal-encoded IPs (0x7f000001, 2130706433, 0177.0.0.1)
    if (/^0x[0-9a-f]+$/i.test(hostname)) return false
    if (/^\d+$/.test(hostname)) return false // decimal IP (2130706433)
    if (/^0\d/.test(hostname.split(".")[0])) return false // octal (0177.0.0.1)

    return true
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

  // Lang attribute
  const lang = $("html").attr("lang")?.trim() || undefined

  // Open Graph tags
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim()
  const ogDescription = $('meta[property="og:description"]').attr("content")?.trim()
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim()
  const ogType = $('meta[property="og:type"]').attr("content")?.trim()
  const ogTags = (ogTitle || ogDescription || ogImage || ogType)
    ? { title: ogTitle, description: ogDescription, image: ogImage, type: ogType }
    : undefined

  // Word count
  const bodyText = $("body").text().replace(/\s+/g, " ").trim()
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0

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
    lang,
    ogTags,
    wordCount,
    bodyText,
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

      // Keywords extraction
      const topKeywords = extractPageKeywords(
        parsed.title,
        parsed.h1,
        parsed.headings,
        parsed.metaDescription,
        parsed.bodyText ?? ""
      )

      // Mobile UX checks via Playwright (run in page context)
      const mobileMetrics = await page.evaluate(() => {
        let smallTapTargets = 0
        let smallFontSizes = 0
        const clickables = document.querySelectorAll("a, button, input, select, textarea, [role='button']")
        clickables.forEach((el) => {
          const rect = el.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
            smallTapTargets++
          }
        })
        const textEls = document.querySelectorAll("p, span, li, td, th, label, div")
        textEls.forEach((el) => {
          const style = window.getComputedStyle(el)
          const fontSize = parseFloat(style.fontSize)
          if (fontSize > 0 && fontSize < 12 && el.textContent && el.textContent.trim().length > 0) {
            smallFontSizes++
          }
        })
        const viewport = document.querySelector('meta[name="viewport"]')
        const hasResponsiveMeta = !!(viewport && viewport.getAttribute("content")?.includes("width=device-width"))
        return { smallTapTargets, smallFontSizes, hasResponsiveMeta }
      }).catch(() => ({ smallTapTargets: 0, smallFontSizes: 0, hasResponsiveMeta: false }))

      return {
        url: finalUrl,
        statusCode,
        redirectUrl,
        responseTime,
        pageSize,
        rawHtml: html,
        ...parsed,
        bodyText: undefined, // Don't persist bodyText
        topKeywords,
        hasResponsiveMeta: mobileMetrics.hasResponsiveMeta,
        smallTapTargets: mobileMetrics.smallTapTargets,
        smallFontSizes: mobileMetrics.smallFontSizes,
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

  private async checkSiteResources(startUrl: string): Promise<{ hasRobotsTxt: boolean; hasSitemap: boolean }> {
    const url = new URL(startUrl)
    const base = `${url.protocol}//${url.host}`

    let hasRobotsTxt = false
    let hasSitemap = false

    try {
      const robotsRes = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(5000) })
      hasRobotsTxt = robotsRes.ok && (await robotsRes.text()).length > 0
    } catch { /* unreachable */ }

    try {
      const sitemapRes = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(5000) })
      hasSitemap = sitemapRes.ok && (await sitemapRes.text()).includes("<")
    } catch { /* unreachable */ }

    return { hasRobotsTxt, hasSitemap }
  }

  async crawlSite(
    startUrl: string,
    onProgress?: (crawled: number, total: number) => void
  ): Promise<PageData[]> {
    const results: PageData[] = []
    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }]

    // Check robots.txt and sitemap once at the start
    const siteResources = await this.checkSiteResources(startUrl)

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
      pageData.hasRobotsTxt = siteResources.hasRobotsTxt
      pageData.hasSitemap = siteResources.hasSitemap
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
