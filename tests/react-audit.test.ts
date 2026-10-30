import { test } from "node:test"
import { mock } from "node:test"
import { createRequire, syncBuiltinESMExports } from "node:module"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import type { IncomingMessage, RequestOptions } from "node:http"
import assert from "node:assert/strict"
import type { AuditPage } from "@prisma/client"
import { chromium } from "playwright"
import { SEOCrawler, parsePageContent } from "../packages/crawler/src/index"
import { analyzePage } from "../packages/analyzer/src/index"
import { crawlMetadata, toAnalysisPage } from "../workers/auditPageData"
import type { PageData } from "../packages/shared/src/types/index"
import { tokenize } from "../packages/shared/src/keywords"

const url = "https://8.8.8.8/"
const pageData = (html: string): PageData => ({ url, statusCode: 200, responseTime: 100, pageSize: html.length, ...parsePageContent(html, url) })
const checks = (page: PageData) => {
  const result = analyzePage(page)
  return [...result.technical, ...result.onPage, ...result.performance, ...result.uxMobile]
}

test("French possessives are not treated as target keywords", () => {
  assert.deepEqual(tokenize("votre notre vos nos conciergerie logement"), ["conciergerie", "logement"])
})

test("Decorative ALT attributes pass; genuinely missing ALT still raises an issue once", () => {
  const page = pageData('<img src="logo.svg" alt=""><img src="photo.jpg" alt="Photo"><img src="missing.jpg">')
  assert.deepEqual(page.images.map(image => image.hasAlt), [true, true, false])
  assert.equal(checks(page).find(check => check.checkName === "images_alt")?.status, "WARN")
  assert.ok(!checks(page).some(check => check.checkName === "image_optimization"))
  assert.equal(checks(pageData('<img src="logo.svg" alt="">')).find(check => check.checkName === "images_alt")?.status, "PASS")
})

test("Schema.org graphs, arrays and nested entities are detected", () => {
  const page = pageData(`<script type="application/ld+json">${JSON.stringify([
    { "@context": "https://schema.org", "@graph": [{ "@type": ["LocalBusiness", "Organization"], address: { "@type": "PostalAddress" } }, { "@type": "Organization" }] },
    { "@type": "BreadcrumbList" },
  ])}</script><script type="application/ld+json">invalid json</script>`)
  assert.deepEqual(page.schemaOrgTypes, ["LocalBusiness", "Organization", "PostalAddress", "BreadcrumbList"])
})

test("Failed navigation and HTTP errors do not invent missing-content problems", () => {
  for (const statusCode of [0, 403, 404, 500]) {
    const page = { ...pageData(""), statusCode, error: "Navigation failed" }
    assert.deepEqual(checks(page).map(check => check.checkName), ["https", "http_status"])
    assert.equal(checks(page)[1].status, "FAIL")
  }
  assert.equal(checks(pageData("<body></body>")).find(check => check.checkName === "h1")?.status, "FAIL")
})

test("Non-HTML documents retain HTTP checks without inventing missing HTML", () => {
  for (const contentType of ["application/xml", "text/xml; charset=utf-8", "text/plain", "application/pdf", "image/svg+xml", "application/json"]) {
    const page = { ...pageData(""), contentType }
    assert.deepEqual(checks(page).map(check => check.checkName), ["https", "http_status"])
    assert.equal(checks(page).find(check => check.checkName === "http_status")?.status, "PASS")
    page.statusCode = 404
    assert.equal(checks(page).find(check => check.checkName === "http_status")?.status, "FAIL")
  }
  for (const contentType of [undefined, "text/html", "TEXT/HTML; charset=UTF-8", "application/xhtml+xml"]) {
    assert.equal(checks({ ...pageData(""), contentType }).find(check => check.checkName === "h1")?.status, "FAIL")
  }
})

test("Canonical comparison follows observed redirects and normalizes default ports without merging distinct paths", () => {
  const page = { ...pageData(""), url: "https://example.com/legal", redirectUrl: "https://example.com:443/legal/", canonicalUrl: "https://example.com/legal/" }
  assert.equal(checks(page).find(check => check.checkName === "canonical")?.status, "PASS")
  assert.equal(checks({ ...page, redirectUrl: undefined }).find(check => check.checkName === "canonical")?.status, "WARN")
  assert.equal(checks({ ...page, canonicalUrl: "https://example.com/other/" }).find(check => check.checkName === "canonical")?.status, "WARN")
  assert.equal(checks({ ...page, canonicalUrl: "https://example.com/legal/?variant=1" }).find(check => check.checkName === "canonical")?.status, "WARN")
})

test("Lazy loading is assessed only on observed below-fold images", () => {
  const page = pageData('<img alt="Hero"><img alt="Logo">')
  assert.ok(!checks(page).some(check => check.checkName === "image_lazy_loading"))
  page.imagesBelowFold = 0; page.imagesBelowFoldLazy = 0
  assert.ok(!checks(page).some(check => check.checkName === "image_lazy_loading"))
  page.imagesBelowFold = 2; page.imagesBelowFoldLazy = 2
  assert.equal(checks(page).find(check => check.checkName === "image_lazy_loading")?.status, "PASS")
  page.imagesBelowFoldLazy = 0
  assert.equal(checks(page).find(check => check.checkName === "image_lazy_loading")?.status, "FAIL")
})

test("The worker preserves crawl evidence and real link URLs through JSON persistence", () => {
  const page = pageData('<meta name="twitter:card" content="summary"><meta name="twitter:title" content="Title"><meta name="twitter:description" content="Description">')
  page.responseHeaders = { "strict-transport-security": "max-age=31536000", "x-content-type-options": "nosniff", "x-frame-options": "DENY" }
  page.contentType = "text/html; charset=UTF-8"
  page.imagesBelowFold = 2; page.imagesBelowFoldLazy = 2; page.imagesLazyCount = 2
  page.hreflangTags = [{ lang: "en", href: url }]
  page.topKeywords = [{ term: "audit", count: 1, score: 1, positions: ["body"] }]
  const saved: AuditPage = {
    id: "page", tenantId: "tenant", auditId: "audit", url, statusCode: 200, redirectUrl: null,
    responseTime: 100, pageSize: 100, isIndexable: true, hasCanonical: false, canonicalUrl: null,
    title: "Title", titleLength: 5, metaDescription: null, metaDescLength: null, h1: [], headings: page.headings,
    totalImages: 2, imagesWithAlt: 2, imagesWithoutAlt: 0, internalLinks: 1, externalLinks: 1, brokenLinks: null,
    internalLinkUrls: [url + "page"], externalLinkUrls: ["http://example.com/"], linkingData: null,
    hasSchemaOrg: false, schemaTypes: [], lang: "en", ogTitle: null, ogDescription: null, ogImage: null, ogType: null,
    wordCount: 1, hasRobotsTxt: true, hasSitemap: true, metaRobots: null, hasViewport: true,
    hasResponsiveMeta: true, smallTapTargets: 0, smallFontSizes: 0, topKeywords: JSON.parse(JSON.stringify(page.topKeywords)),
    crawlMetadata: JSON.parse(JSON.stringify(crawlMetadata(page))), rawHtml: null, crawledAt: new Date(),
  }
  const restored = toAnalysisPage(saved)
  assert.deepEqual(restored.twitterCard, page.twitterCard)
  assert.deepEqual(restored.hreflangTags, page.hreflangTags)
  assert.deepEqual(restored.responseHeaders, page.responseHeaders)
  assert.equal(restored.contentType, page.contentType)
  assert.deepEqual(restored.topKeywords, page.topKeywords)
  assert.equal(checks(restored).find(check => check.checkName === "twitter_cards")?.status, "PASS")
  assert.equal(checks(restored).find(check => check.checkName === "image_lazy_loading")?.status, "PASS")
  assert.equal(checks(restored).find(check => check.checkName === "https_resources")?.status, "WARN")
  assert.equal(checks(restored).find(check => check.checkName === "security_headers")?.status, "PASS")
  assert.doesNotThrow(() => toAnalysisPage({ ...saved, crawlMetadata: null }))
  const xml = toAnalysisPage({ ...saved, crawlMetadata: { version: 1, contentType: "application/xml" } })
  assert.deepEqual(checks(xml).map(check => check.checkName), ["https", "http_status"])
})

test("Browser: delayed SPA rendering, metadata updates, genuine omissions and mobile target spacing", { skip: !process.env.RUN_CRAWLER_BROWSER_TESTS, timeout: 40_000 }, async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  const context = await browser.newContext()
  const crawler = new SEOCrawler()
  await crawler.launch()
  try {
    await context.route("**/*", async route => {
      if (route.request().url().endsWith("/data")) {
        await new Promise<void>(resolve => setTimeout(resolve, 2200))
        await route.fulfill({ contentType: "application/json", body: '{"title":"Rendered title"}' })
        return
      }
      await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="fr"><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        button { width:32px; height:32px; padding:0; }
        .tiny { width:16px; height:16px; position:absolute; top:500px; }
        #isolated { left:200px; } #crowded1 { left:0; } #crowded2 { left:16px; }
        #hidden { visibility:hidden; } #desktop { display:block; }
        @media(max-width:600px) { #desktop { display:none; } }
        </style></head><body><div id="root">Loading</div>
        <script>fetch('/data').then(r => r.json()).then(data => {
          document.title = data.title;
          document.head.insertAdjacentHTML('beforeend', '<meta name="description" content="Rendered description"><script type="application/ld+json">{"@type":"Organization"}<\\/script>');
          document.getElementById('root').innerHTML = '<h1>Rendered heading</h1><p>Rendered content <a href="/article">inline link</a> inside a sentence</p><button>OK</button><button class="tiny" id="isolated">I</button><button class="tiny" id="crowded1">A</button><button class="tiny" id="crowded2">B</button><button id="hidden">hidden</button><div id="desktop" style="font-size:8px">Desktop text</div><div style="font-size:10px"><span>Small text</span></div><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="">';
        });</script></body></html>` })
    })
    const page = await crawler.crawlPage(url, context)
    assert.equal(page.error, undefined)
    assert.equal(page.title, "Rendered title")
    assert.equal(page.metaDescription, "Rendered description")
    assert.deepEqual(page.h1, ["Rendered heading"])
    assert.ok(page.wordCount! > 0)
    assert.ok(page.internalLinks.includes(url + "article"))
    assert.deepEqual(page.schemaOrgTypes, ["Organization"])
    assert.equal(page.smallTapTargets, 2)
    assert.equal(page.smallFontSizes, 1)
    assert.ok(page.responseTime < 1500, "Render waiting must not inflate response time")
    assert.equal(checks(page).find(check => check.checkName === "images_alt")?.status, "PASS")
    // Real content without an H1 is still flagged, rather than waiting for a mandatory H1.
    await context.unroute("**/*")
    await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: '<html><body><p>Content without headings</p></body></html>' }))
    const missing = await crawler.crawlPage(url, context)
    assert.equal(checks(missing).find(check => check.checkName === "h1")?.status, "FAIL")
    await context.unroute("**/*")
    await context.route("**/*", route => route.fulfill({ contentType: "application/xml", body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://8.8.8.8/</loc></url></urlset>' }))
    const xml = await crawler.crawlPage(url + "sitemap.xml", context)
    assert.equal(xml.error, undefined)
    assert.match(xml.contentType ?? "", /^application\/xml/)
    assert.deepEqual(xml.schemaOrgTypes, [])
    assert.deepEqual(checks(xml).map(check => check.checkName), ["https", "http_status"])
  } finally { await crawler.close(); await context.close(); await browser.close() }
})

test("Browser: pinned redirects retain the final URL in the configured crawler context", { skip: !process.env.RUN_CRAWLER_BROWSER_TESTS, timeout: 20_000 }, async () => {
  const require = createRequire(import.meta.url)
  const https = require("node:https") as typeof import("node:https")
  const request = mock.method(https, "request", (target: URL, _options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    const req = new EventEmitter()
    const redirect = target.pathname === "/legal"
    const privateRedirect = target.pathname === "/private"
    return Object.assign(req, {
      end() { queueMicrotask(() => {
        const response = Object.assign(Readable.from([Buffer.from(redirect ? "" : '<html lang="fr"><head><link rel="canonical" href="https://8.8.8.8/legal/"></head><body><h1>Legal</h1></body></html>')]), {
          statusCode: redirect || privateRedirect ? 301 : 200,
          headers: privateRedirect ? { location: "http://127.0.0.1/secret" } : redirect ? { location: "/legal/" } : { "content-type": "text/html" },
        })
        callback(response as unknown as IncomingMessage)
        req.emit("close")
      }) },
      destroy(error: Error) { req.emit("error", error); req.emit("close") },
    })
  })
  syncBuiltinESMExports()
  const crawler = new SEOCrawler({ timeout: 5000 })
  await crawler.launch()
  try {
    const page = await crawler.crawlPage("https://8.8.8.8/legal")
    assert.equal(page.error, undefined, `Mocked requests: ${request.mock.callCount()}; ${page.error ?? ""}`)
    assert.equal(page.url, "https://8.8.8.8/legal/")
    assert.equal(page.redirectUrl, "https://8.8.8.8/legal/")
    assert.equal(page.contentType, "text/html")
    assert.equal(checks(page).find(check => check.checkName === "canonical")?.status, "PASS")
    assert.ok(request.mock.callCount() >= 2)
    const denied = await crawler.crawlPage("https://8.8.8.8/private")
    assert.equal(denied.statusCode, 0)
    assert.ok(denied.error)
    assert.ok(request.mock.calls.every(call => call.arguments[0].hostname === "8.8.8.8"))
  } finally { await crawler.close(); mock.restoreAll(); syncBuiltinESMExports() }
})
