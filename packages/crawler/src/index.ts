import { chromium, Browser, BrowserContext } from "playwright"
import * as cheerio from "cheerio"
import { URL } from "url"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import type { PageData } from "@seo/shared"
import { extractPageKeywords } from "@seo/shared"

export type { PageData }

// ─────────────────────────────────────────────
// Anti-SSRF
// ─────────────────────────────────────────────

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
])

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".lan"]

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true
  }

  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a >= 224) return true
  return false
}

function isPrivateIPv6(address: string): boolean {
  const host = normalizeHostname(address)
  return (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:") ||
    host.startsWith("::ffff:127.") ||
    host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:192.168.") ||
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname)
  if (!host) return true
  if (BLOCKED_HOSTS.has(host)) return true
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true

  const ipVersion = isIP(host)
  if (ipVersion === 4) return isPrivateIPv4(host)
  if (ipVersion === 6) return isPrivateIPv6(host)

  if (/^0x[0-9a-f]+$/i.test(host)) return true
  if (/^\d+$/.test(host)) return true
  if (/^0\d/.test(host.split(".")[0])) return true

  return false
}

export function isValidPublicUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    if (!["http:", "https:"].includes(url.protocol)) return false
    if (url.username || url.password) return false
    if (isBlockedHostname(url.hostname)) return false

    return true
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────
// Robots.txt
// ─────────────────────────────────────────────

const dnsValidationCache = new Map<string, Promise<boolean>>()

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  const host = normalizeHostname(hostname)
  if (isBlockedHostname(host)) return false
  if (isIP(host)) return true

  const cached = dnsValidationCache.get(host)
  if (cached) return cached

  const check = lookup(host, { all: true, verbatim: true })
    .then((records) => records.length > 0 && records.every((record) => !isBlockedHostname(record.address)))
    .catch(() => false)

  dnsValidationCache.set(host, check)
  return check
}

export async function isValidPublicUrlWithDns(urlString: string): Promise<boolean> {
  if (!isValidPublicUrl(urlString)) return false
  try {
    const url = new URL(urlString)
    return resolvesToPublicAddress(url.hostname)
  } catch {
    return false
  }
}

// Parse un robots.txt en règles Allow/Disallow applicables au user-agent donné.
// Gère : groupes multi-agents, directive Allow, et la précision longest-match
// (la règle la plus spécifique l'emporte, conformément au standard de Google).
type RobotsRule = { type: "allow" | "disallow"; path: string }

function parseRobots(text: string, userAgent: string): RobotsRule[] {
  const uaLower = userAgent.toLowerCase()
  const lines = text.split(/\r?\n/)

  // Regroupe les directives par groupe d'agents. Un groupe = une suite de
  // lignes User-agent suivies de directives, jusqu'au prochain User-agent.
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = []
  let current: { agents: string[]; rules: RobotsRule[] } | null = null
  let expectingAgents = false

  for (const raw of lines) {
    const line = raw.split("#")[0].trim()
    if (!line) continue
    const sep = line.indexOf(":")
    if (sep === -1) continue
    const field = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()

    if (field === "user-agent") {
      if (!expectingAgents || !current) {
        current = { agents: [], rules: [] }
        groups.push(current)
        expectingAgents = true
      }
      current.agents.push(value.toLowerCase())
    } else if (field === "allow" || field === "disallow") {
      expectingAgents = false
      if (current && value) current.rules.push({ type: field, path: value })
      // Une ligne "Disallow:" vide (value === "") signifie "tout autoriser" : on l'ignore.
    }
  }

  // Sélectionne le groupe le plus spécifique : correspondance exacte du nom
  // d'agent en priorité, sinon le groupe "*".
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && uaLower.includes(a)))
  const wildcard = groups.find((g) => g.agents.includes("*"))
  return (specific ?? wildcard)?.rules ?? []
}

// Convertit un pattern robots (avec * et $) en RegExp ancrée au début du chemin.
function robotsPathToRegex(pattern: string): RegExp {
  let re = ""
  for (const ch of pattern) {
    if (ch === "*") re += ".*"
    else if (ch === "$") re += "$"
    else re += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp("^" + re)
}

function isPathAllowed(rules: RobotsRule[], pathname: string): boolean {
  // Règle gagnante = match le plus long ; à longueur égale, Allow l'emporte.
  let best: { rule: RobotsRule; length: number } | null = null
  for (const rule of rules) {
    if (robotsPathToRegex(rule.path).test(pathname)) {
      const length = rule.path.replace(/[*$]/g, "").length
      if (!best || length > best.length || (length === best.length && rule.type === "allow")) {
        best = { rule, length }
      }
    }
  }
  return best ? best.rule.type === "allow" : true
}

// Cache du robots.txt par hôte (évite de le re-télécharger à chaque page)
const robotsCache = new Map<string, Promise<RobotsRule[] | null>>()

async function fetchRobotsRules(origin: string, userAgent: string): Promise<RobotsRule[] | null> {
  const cached = robotsCache.get(origin)
  if (cached) return cached

  const promise = (async () => {
    try {
      const response = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return null // pas de robots.txt → tout autorisé
      return parseRobots(await response.text(), userAgent)
    } catch {
      return null
    }
  })()

  robotsCache.set(origin, promise)
  return promise
}

async function isAllowedByRobots(pageUrl: string, userAgent: string): Promise<boolean> {
  try {
    if (!(await isValidPublicUrlWithDns(pageUrl))) return false
    const url = new URL(pageUrl)
    const rules = await fetchRobotsRules(`${url.protocol}//${url.host}`, userAgent)
    if (!rules) return true
    return isPathAllowed(rules, url.pathname + url.search)
  } catch {
    return true
  }
}

// Normalise une URL pour la déduplication du crawl :
// - retire le fragment (#...), qui ne change jamais la page servie
// - retire un éventuel slash final (sauf racine)
// - minuscule l'hôte
// Retourne null si l'URL est invalide.
function normalizeUrlForCrawl(rawUrl: string, base?: string): string | null {
  try {
    const url = new URL(rawUrl, base)
    url.hash = ""
    url.hostname = url.hostname.toLowerCase()
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "")
    }
    return url.href
  } catch {
    return null
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

  // Twitter Card tags
  const tcCard = $('meta[name="twitter:card"]').attr("content")?.trim()
  const tcTitle = $('meta[name="twitter:title"]').attr("content")?.trim()
  const tcDesc = $('meta[name="twitter:description"]').attr("content")?.trim()
  const twitterCard = (tcCard || tcTitle || tcDesc)
    ? { card: tcCard, title: tcTitle, description: tcDesc }
    : undefined

  // Hreflang tags
  const hreflangTags: { lang: string; href: string }[] = []
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang")?.trim()
    const href = $(el).attr("href")?.trim()
    if (lang && href) hreflangTags.push({ lang, href })
  })

  // Lazy-loaded images count
  let imagesLazyCount = 0
  $("img").each((_, el) => {
    if ($(el).attr("loading") === "lazy") imagesLazyCount++
  })

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
    twitterCard,
    hreflangTags: hreflangTags.length > 0 ? hreflangTags : undefined,
    imagesLazyCount,
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
      // Borné [1,10] : au-delà on risque de surcharger / faire bloquer le site cible.
      concurrency: Math.max(1, Math.min(10, options.concurrency ?? 5)),
      politenessDelay: options.politenessDelay ?? 250,
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
    // Purger les caches partagés entre audits (évite la fuite mémoire dans un
    // worker durable et les règles robots/DNS obsolètes au prochain crawl).
    robotsCache.clear()
    dnsValidationCache.clear()
  }

  // Crée un BrowserContext configuré (userAgent + viewport selon le device).
  // Réutilisé pour toutes les pages d'un crawl afin d'éviter le coût de recréation.
  private async newConfiguredContext(): Promise<BrowserContext> {
    if (!this.browser) throw new Error("Browser non initialisé. Appeler launch() d'abord.")
    return this.browser.newContext({
      userAgent: this.options.userAgent,
      viewport:
        this.options.device === "mobile"
          ? { width: 375, height: 812 }
          : { width: 1280, height: 800 },
    })
  }

  // Si sharedContext est fourni, la page est créée dedans (et le contexte n'est PAS
  // fermé ici — c'est l'appelant qui en gère le cycle de vie). Sinon, un contexte
  // jetable est créé puis fermé, ce qui préserve l'usage standalone de crawlPage().
  async crawlPage(url: string, sharedContext?: BrowserContext): Promise<PageData> {
    if (!this.browser) throw new Error("Browser non initialisé. Appeler launch() d'abord.")
    if (!(await isValidPublicUrlWithDns(url))) throw new Error(`URL bloquée (SSRF): ${url}`)

    const context = sharedContext ?? (await this.newConfiguredContext())
    const ownsContext = !sharedContext

    const page = await context.newPage()
    const start = Date.now()

    try {
      await page.route("**/*", async (route) => {
        const requestUrl = route.request().url()
        if (await isValidPublicUrlWithDns(requestUrl)) {
          await route.continue()
        } else {
          await route.abort("blockedbyclient")
        }
      })

      const response = await page.goto(url, {
        // domcontentloaded : on n'attend pas le réseau "idle" (tracking/pub/websockets
        // peuvent empêcher l'idle jusqu'au timeout). Le HTML SEO est dispo dès le DOM parsé.
        waitUntil: "domcontentloaded",
        timeout: this.options.timeout,
      })

      // Laisse un court instant au JS critique de rendre le contenu (SPA légères,
      // hydration). Bien moins coûteux que d'attendre networkidle.
      await page.waitForLoadState("load", { timeout: 3000 }).catch(() => {})

      const responseTime = Date.now() - start
      const statusCode = response?.status() ?? 0
      const finalUrl = page.url()
      if (!(await isValidPublicUrlWithDns(finalUrl))) throw new Error(`URL finale bloquée (SSRF): ${finalUrl}`)
      const redirectUrl = finalUrl !== url ? finalUrl : undefined
      const html = await page.content()
      const pageSize = Buffer.byteLength(html, "utf-8")
      const parsed = parsePageContent(html, finalUrl)

      // Capture response headers (sécurité)
      const rawHeaders = response?.headers() ?? {}
      const responseHeaders: Record<string, string> = {}
      for (const key of ["strict-transport-security", "x-content-type-options", "x-frame-options", "content-security-policy", "referrer-policy", "permissions-policy"]) {
        if (rawHeaders[key]) responseHeaders[key] = rawHeaders[key]
      }

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
        ...parsed,
        bodyText: undefined, // Don't persist bodyText
        topKeywords,
        responseHeaders,
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
      await page.close().catch(() => {})
      if (ownsContext) await context.close().catch(() => {})
    }
  }

  private async checkSiteResources(startUrl: string): Promise<{ hasRobotsTxt: boolean; hasSitemap: boolean }> {
    if (!(await isValidPublicUrlWithDns(startUrl))) return { hasRobotsTxt: false, hasSitemap: false }
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

    const normalizedStart = normalizeUrlForCrawl(startUrl)
    if (!normalizedStart) return results
    const baseDomain = new URL(normalizedStart).hostname.toLowerCase()

    // File BFS, traitée par niveau de profondeur. À l'intérieur d'un niveau,
    // les pages sont crawlées par vagues parallèles de `concurrency`.
    let frontier: Array<{ url: string; depth: number }> = [{ url: normalizedStart, depth: 0 }]
    // On marque les URLs vues à l'enfilement (pas au défilement) pour éviter
    // d'empiler plusieurs fois la même URL présente sur plusieurs pages.
    this.visitedUrls.add(normalizedStart)

    // Check robots.txt and sitemap once at the start
    const siteResources = await this.checkSiteResources(startUrl)

    // Un seul BrowserContext partagé pour tout le crawl (cookies/cache mutualisés,
    // pas de coût de recréation par page). Les pages sont ouvertes/fermées dedans.
    const context = await this.newConfiguredContext()

    try {
      while (frontier.length > 0 && results.length < this.options.maxPages) {
        const currentDepth = frontier[0].depth
        if (currentDepth > this.options.maxDepth) break

        // Pages restantes autorisées avant d'atteindre maxPages.
        const remaining = this.options.maxPages - results.length
        const batch = frontier.slice(0, remaining)
        frontier = frontier.slice(remaining)

        // Traite ce niveau par vagues de `concurrency` pages simultanées.
        const nextFrontier: Array<{ url: string; depth: number }> = []
        for (let i = 0; i < batch.length; i += this.options.concurrency) {
          if (results.length >= this.options.maxPages) break
          const wave = batch.slice(i, i + this.options.concurrency)

          const waveResults = await Promise.all(
            wave.map(async ({ url, depth }) => {
              try {
                if (this.options.respectRobots) {
                  const allowed = await isAllowedByRobots(url, this.options.userAgent)
                  if (!allowed) return null
                }
                const pageData = await this.crawlPage(url, context)
                pageData.hasRobotsTxt = siteResources.hasRobotsTxt
                pageData.hasSitemap = siteResources.hasSitemap
                return { pageData, depth }
              } catch {
                // Une page qui throw (ex: SSRF en cours de crawl) ne doit pas faire
                // échouer toute la vague ni interrompre le crawl ; on l'ignore.
                return null
              }
            })
          )

          for (const item of waveResults) {
            if (!item) continue
            results.push(item.pageData)
            // La cible est le min(maxPages, pages réellement atteignables) ; on borne
            // la progression par maxPages, jamais par une division par zéro.
            onProgress?.(results.length, Math.max(1, this.options.maxPages))

            if (item.depth < this.options.maxDepth) {
              for (const link of item.pageData.internalLinks) {
                const normalized = normalizeUrlForCrawl(link)
                if (!normalized) continue
                let linkDomain: string
                try {
                  linkDomain = new URL(normalized).hostname.toLowerCase()
                } catch {
                  continue
                }
                if (linkDomain === baseDomain && !this.visitedUrls.has(normalized)) {
                  this.visitedUrls.add(normalized)
                  nextFrontier.push({ url: normalized, depth: item.depth + 1 })
                }
              }
            }
          }

          // Politesse : court délai entre deux vagues envers le site cible.
          if (this.options.politenessDelay > 0) {
            await new Promise((r) => setTimeout(r, this.options.politenessDelay))
          }
        }

        // Les URLs du niveau courant non traitées (au-delà de maxPages) sont
        // déjà sorties de la frontier ; on enchaîne sur le niveau suivant.
        frontier = [...frontier, ...nextFrontier]
      }

      return results
    } finally {
      await context.close().catch(() => {})
    }
  }
}
