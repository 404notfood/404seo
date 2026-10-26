import { test } from "node:test"
import assert from "node:assert/strict"
import type { AuditPage } from "@prisma/client"
import { chromium } from "playwright"
import { SEOCrawler, parsePageContent } from "../packages/crawler/src/index"
import { analyzePage } from "../packages/analyzer/src/index"
import { crawlMetadata, toAnalysisPage } from "../workers/auditPageData"
import type { PageData } from "../packages/shared/src/types/index"

const url = "https://8.8.8.8/"
const pageData = (html: string): PageData => ({ url, statusCode: 200, responseTime: 100, pageSize: html.length, ...parsePageContent(html, url) })
const checks = (page: PageData) => {
  const result = analyzePage(page)
  return [...result.technical, ...result.onPage, ...result.performance, ...result.uxMobile]
}

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
  assert.deepEqual(restored.topKeywords, page.topKeywords)
  assert.equal(checks(restored).find(check => check.checkName === "twitter_cards")?.status, "PASS")
  assert.equal(checks(restored).find(check => check.checkName === "image_lazy_loading")?.status, "PASS")
  assert.equal(checks(restored).find(check => check.checkName === "https_resources")?.status, "WARN")
  assert.equal(checks(restored).find(check => check.checkName === "security_headers")?.status, "PASS")
  assert.doesNotThrow(() => toAnalysisPage({ ...saved, crawlMetadata: null }))
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
  } finally { await crawler.close(); await context.close(); await browser.close() }
})
