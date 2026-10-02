import { test } from "node:test"
import assert from "node:assert/strict"
import { gzipSync } from "node:zlib"
import { collectSitemapInventory, parseSitemapXml, sitemapRootsFromRobots, SITEMAP_IMPORT_LIMITS } from "../packages/crawler/src/sitemaps"
import { readSitemapInventory } from "../packages/shared/src/urlInventory"
import type { SitemapFetch, SitemapFetchResponse } from "../packages/crawler/src/sitemaps"

const origin = "https://example.com"
const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
const xml = (urls: string[], index = false) => "<" + (index ? "sitemapindex" : "urlset") + ' xmlns="' + namespace + '">' +
  urls.map(url => "<" + (index ? "sitemap" : "url") + "><loc>" + url.replaceAll("&", "&amp;") + "</loc></" + (index ? "sitemap" : "url") + ">").join("") +
  "</" + (index ? "sitemapindex" : "urlset") + ">"
const response = (body: string | Uint8Array, status = 200, headers: Record<string, string> = {}): SitemapFetchResponse =>
  ({ status, headers, body: typeof body === "string" ? Buffer.from(body) : body })
const transport = (responses: Record<string, SitemapFetchResponse>, calls: string[] = []): SitemapFetch => async url => {
  calls.push(url)
  return responses[url] ?? response("", 404)
}

test("sitemaps: namespace-aware XML, absolute scoped URLs, query preservation and deduplication", () => {
  const contents = '<sm:urlset xmlns:sm="' + namespace + '" xmlns:s="' + namespace + '" xmlns:image="urn:image">' +
    "<sm:url><sm:loc>" + origin + "/shop/a?color=red&amp;size=2</sm:loc><image:loc>" + origin + "/wrong</image:loc></sm:url>" +
    "<s:url><s:loc><![CDATA[" + origin + "/shop/b?x=1&y=2]]></s:loc></s:url>" +
    "<sm:url><sm:loc>" + origin + "/shop/b?x=1&amp;y=2#fragment</sm:loc></sm:url>" +
    [origin + "/shopping/a", "http://127.0.0.1/shop/a", "/shop/relative", "https://other.example/shop/a"].map(url => "<sm:url><sm:loc>" + url + "</sm:loc></sm:url>").join("") +
    "</sm:urlset>"
  assert.deepEqual(parseSitemapXml(contents, origin + "/shop"), {
    kind: "URLSET", urls: [origin + "/shop/a?color=red&size=2", origin + "/shop/b?x=1&y=2"], omitted: 4,
  })
  assert.deepEqual(parseSitemapXml(xml([origin + "/outside/shop.xml", "https://other.example/map.xml"], true), origin + "/shop"), {
    kind: "INDEX", urls: [origin + "/outside/shop.xml"], omitted: 1,
  })
})

test("sitemaps: reject XML entities, DTDs, malformed documents, excessive nesting and incompatible encoding", () => {
  for (const invalid of [
    '<!DOCTYPE urlset [<!ENTITY x SYSTEM "file:///etc/passwd">]><urlset><url><loc>&x;</loc></url></urlset>',
    "<urlset><url><loc>&custom;</loc></url></urlset>", "<urlset><url></urlset>", "<html></html>",
    '<urlset xmlns="urn:wrong"></urlset>', '<?xml version="1.0" encoding="UTF-16"?><urlset/>',
    "<urlset>" + "<a>".repeat(33) + "</a>".repeat(33) + "</urlset>", " ".repeat(SITEMAP_IMPORT_LIMITS.documentBytes + 1),
  ]) assert.throws(() => parseSitemapXml(invalid, origin))
  assert.equal(parseSitemapXml("<urlset><url><loc><a>" + origin + "/nested</a></loc></url></urlset>", origin).omitted, 1)
})

test("sitemaps: robots discovery, XML indexes, bounded gzip and source provenance survive a partial import", async () => {
  const calls: string[] = []
  const robots = "SITEMAP: " + origin + "/index.xml\nSitemap: " + origin + "/index.xml#dup\nSitemap: http://127.0.0.1/private.xml\nSitemap: https://other.example/map.xml"
  assert.deepEqual(sitemapRootsFromRobots(robots, origin), [origin + "/index.xml"])
  const data = await collectSitemapInventory(origin, undefined, { fetch: transport({
    [origin + "/robots.txt"]: response(robots),
    [origin + "/index.xml"]: response(xml([origin + "/a.xml", origin + "/b.gz", origin + "/missing.xml"], true)),
    [origin + "/a.xml"]: response(xml([origin + "/a"])),
    [origin + "/b.gz"]: response(gzipSync(xml([origin + "/a", origin + "/b"]))),
  }, calls) })
  assert.equal(calls.length, 5)
  assert.deepEqual(data.pages[0].documentIndexes, [1, 2])
  assert.equal(data.pages.length, 2)
  assert.equal(data.documents[3].status, "HTTP_ERROR")
  assert.equal(data.limits.documents, true)
  assert.ok(readSitemapInventory(data))
})

test("sitemaps: no private or cross-origin requests, blocked redirects and bounded gzip expansion", async () => {
  const calls: string[] = []
  const fetcher = transport({
    [origin + "/index.xml"]: response(xml([origin + "/good.xml", origin + "/redirect.xml", origin + "/bomb.gz", "http://127.0.0.1/private.xml", "https://other.example/map.xml"], true)),
    [origin + "/good.xml"]: response(xml([origin + "/valid"])),
    [origin + "/redirect.xml"]: response("", 302, { location: "https://other.example/foreign.xml" }),
    [origin + "/bomb.gz"]: response(gzipSync("a".repeat(SITEMAP_IMPORT_LIMITS.documentBytes + 1))),
    [origin + "/old.xml"]: response("", 301, { location: "/good.xml" }),
  }, calls)
  for (const invalid of ["http://127.0.0.1/map.xml", "https://other.example/map.xml", "https://user:pass@example.com/map.xml"])
    await assert.rejects(collectSitemapInventory(origin, invalid, { fetch: fetcher }))
  assert.equal(calls.length, 0)
  const data = await collectSitemapInventory(origin, origin + "/index.xml", { fetch: fetcher })
  assert.equal(data.pages.length, 1); assert.equal(data.omittedUrls, 2)
  assert.equal(data.documents[2].status, "REDIRECT_BLOCKED"); assert.equal(data.documents[3].status, "TOO_LARGE")
  assert.ok(calls.every(url => new URL(url).origin === origin))
  const redirected = await collectSitemapInventory(origin, origin + "/old.xml", { fetch: fetcher })
  assert.equal(redirected.documents[0].url, origin + "/good.xml")
})

test("sitemaps: document, URL, depth and time limits are explicit; total failure never creates an empty success", async () => {
  const maps: Record<string, SitemapFetchResponse> = { [origin + "/index.xml"]: response(xml(Array.from({ length: 25 }, (_, i) => origin + "/" + i + ".xml"), true)) }
  for (let i = 0; i < 25; i++) maps[origin + "/" + i + ".xml"] = response(xml([origin + "/page-" + i]))
  const limited = await collectSitemapInventory(origin, origin + "/index.xml", { fetch: transport(maps) })
  assert.equal(limited.documents.length, 20); assert.equal(limited.limits.documents, true)
  const urlLimited = await collectSitemapInventory(origin, origin + "/large.xml", {
    fetch: transport({ [origin + "/large.xml"]: response(xml(Array.from({ length: 10_001 }, (_, i) => origin + "/page-" + i))) }),
  })
  assert.equal(urlLimited.pages.length, 10_000); assert.equal(urlLimited.limits.urls, true)
  const deep = await collectSitemapInventory(origin, origin + "/root.xml", { fetch: transport({
    [origin + "/root.xml"]: response(xml([origin + "/good.xml", origin + "/one.xml"], true)),
    [origin + "/good.xml"]: response(xml([origin + "/good"])),
    [origin + "/one.xml"]: response(xml([origin + "/two.xml"], true)),
    [origin + "/two.xml"]: response(xml([origin + "/three.xml"], true)),
  }) })
  assert.equal(deep.limits.depth, true); assert.equal(deep.documents.length, 4)
  let elapsed = 0
  const timed = await collectSitemapInventory(origin, origin + "/index.xml", { now: () => elapsed, fetch: async url => { elapsed += 7000; return maps[url] } })
  assert.equal(timed.limits.time, true); assert.equal(timed.documents.length, 3)
  await assert.rejects(collectSitemapInventory(origin, origin + "/missing-index.xml", { fetch: transport({ [origin + "/missing-index.xml"]: response(xml([origin + "/missing.xml"], true)) }) }))
  await assert.rejects(collectSitemapInventory(origin, origin + "/html", { fetch: async () => response("<html/>") }))
})
