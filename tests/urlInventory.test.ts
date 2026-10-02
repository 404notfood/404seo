import { test } from "node:test"
import assert from "node:assert/strict"
import { buildInternalLinkAnalysis } from "../packages/shared/src/internalLinks"
import { buildUrlInventory, inventoryUrls, matchesUrlInventoryMode, readSitemapInventory } from "../packages/shared/src/urlInventory"
import { serializeCsv } from "../packages/shared/src/csv"
import type { InternalLinkPageInput } from "../packages/shared/src/types/internalLinks.types"
import type { SitemapInventory, UrlInventoryBuildInput } from "../packages/shared/src/types/urlInventory.types"

const origin = "https://example.com/"
const page = (path: string, overrides: Partial<InternalLinkPageInput> = {}): InternalLinkPageInput => ({
  url: origin + path, title: path, h1: [], statusCode: 200, isIndexable: true, redirectUrl: null, canonicalUrl: null,
  lang: "fr", internalLinks: 0, internalLinkUrls: [], linkingData: null, ...overrides,
})
const sitemap = (paths: string[]): SitemapInventory => ({
  version: 1, roots: [origin + "map.xml"], documents: [{ url: origin + "map.xml", status: "OK", httpStatus: 200, kind: "URLSET", urlCount: paths.length }],
  pages: paths.map(path => ({ url: origin + path, documentIndexes: [0] })), omittedUrls: 0,
  limits: { documents: false, urls: false, bytes: false, time: false, depth: false, stored: false },
})
const input = (pages: InternalLinkPageInput[], overrides: Partial<UrlInventoryBuildInput> = {}): UrlInventoryBuildInput => ({
  projectUrl: origin, entryUrl: origin, hasAudit: true, auditPages: pages, analysis: buildInternalLinkAnalysis(pages, origin),
  auditedUrls: pages.map(row => row.url), sitemap: null, searchPages: [], staleSearch: false, ...overrides,
})

test("URL inventory distinguishes observed links, missing crawl pages, exclusions and graph omissions with source evidence", () => {
  const pages = [page("", { internalLinkUrls: [origin + "a", origin + "linked-missing"] }), page("a"), page("isolated"), page("excluded", { statusCode: 404 })]
  const result = buildUrlInventory(input(pages, {
    sitemap: sitemap(["", "a", "isolated", "missing", "linked-missing", "excluded", "unassessed"]),
    auditedUrls: [...pages.map(row => row.url), origin + "unassessed"],
    searchPages: [{ pageUrl: origin + "gsc-only", clicks: 2, impressions: 40 }, { pageUrl: origin + "isolated", clicks: 0, impressions: 0 },
      { pageUrl: "https://other.example/a", clicks: 999, impressions: 999 }],
  }))
  assert.equal(result.items.length, 8)
  const row = (path: string) => result.items.find(item => item.url === origin + path)!
  assert.equal(row("isolated").state, "NO_INCOMING"); assert.equal(row("missing").state, "NOT_CRAWLED")
  assert.equal(row("linked-missing").state, "LINKED_NOT_CRAWLED"); assert.equal(row("linked-missing").incoming, 1)
  assert.equal(row("excluded").state, "EXCLUDED"); assert.equal(row("unassessed").state, "UNASSESSED")
  assert.equal(row("unassessed").incoming, null); assert.equal(row("").state, "LINKED"); assert.equal(row("a").state, "LINKED")
  assert.deepEqual(row("isolated").search, { clicks: 0, impressions: 0 }); assert.equal(row("missing").search, null)
  assert.deepEqual(row("isolated").sitemapUrls, [origin + "map.xml"])
  assert.equal(result.items.filter(item => matchesUrlInventoryMode(item, "investigate")).length, 3)
  assert.equal(result.items.filter(item => matchesUrlInventoryMode(item, "not-crawled")).length, 3)
})

test("URL inventory never infers isolation without an audit and preserves links omitted from the graph", () => {
  const pages = [page("", { internalLinkUrls: [origin + "isolated"] }), page("isolated")]
  const base = input(pages, { sitemap: sitemap(["isolated"]) })
  const noAudit = buildUrlInventory({ ...base, hasAudit: false })
  assert.equal(noAudit.items[0].state, "NO_AUDIT"); assert.equal(noAudit.items[0].incoming, null)
  assert.equal(matchesUrlInventoryMode(noAudit.items[0], "investigate"), false)
  base.analysis.nodes.forEach(node => { node.incoming = 0 })
  base.analysis.limits.links = true
  const knownLink = buildUrlInventory(base).items[0]
  assert.equal(knownLink.state, "LINKED"); assert.equal(knownLink.incoming, 1)
})

test("URL inventory preserves path/parameter scopes, reports caps and avoids prioritizing stale GSC metrics", () => {
  const scoped = inventoryUrls(sitemap(["shop/a?color=red", "shop/a?color=blue", "shopping/a"]), [], origin + "shop")
  assert.deepEqual(scoped.urls, [origin + "shop/a?color=red", origin + "shop/a?color=blue"])
  const capped = inventoryUrls(sitemap(Array.from({ length: 10_000 }, (_, i) => "a-" + i)), [{ pageUrl: origin + "extra", clicks: 1, impressions: 1 }], origin)
  assert.equal(capped.urls.length, 10_000); assert.equal(capped.limited, true)
  const base = input([], { sitemap: sitemap(["a", "z"]), searchPages: [{ pageUrl: origin + "z", clicks: 20, impressions: 999 }] })
  assert.equal(buildUrlInventory(base).items[0].url, origin + "z")
  assert.equal(buildUrlInventory({ ...base, staleSearch: true }).items[0].url, origin + "a")
  assert.ok(readSitemapInventory(sitemap(["a"])))
  const malformed = sitemap(["a"]); malformed.pages[0].documentIndexes = [999]
  assert.equal(readSitemapInventory(malformed), null)
  malformed.pages[0] = { url: "javascript:alert(1)", documentIndexes: [0] }
  assert.equal(readSitemapInventory(malformed), null)
})

test("CSV exports quote untrusted text, preserve multiline cells and neutralize spreadsheet formulas", () => {
  const csv = serializeCsv([['=HYPERLINK("evil")', "  +SUM(A1)", "@command", "-formula", 'Normal; "quoted"\nline', origin]])
  assert.ok(csv.startsWith('"' + String.fromCharCode(39) + '=HYPERLINK(""evil"")"'))
  for (const value of ["  +SUM(A1)", "@command", "-formula"]) assert.ok(csv.includes('"' + String.fromCharCode(39) + value + '"'))
  assert.ok(csv.includes('"Normal; ""quoted""\nline"')); assert.ok(csv.endsWith('"' + origin + '"'))
})
