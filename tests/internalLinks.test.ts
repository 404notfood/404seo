import { test } from "node:test"
import assert from "node:assert/strict"
import * as cheerio from "cheerio"
import { extractLinkingData } from "../packages/crawler/src/linkingData"
import { googleRobotsMeta, readGoogleRobotsRules } from "../packages/crawler/src/robotsDirectives"
import { buildInternalLinkAnalysis, normalizeInternalLinkUrl, readLinkingData } from "../packages/shared/src/internalLinks"
import type { InternalLinkPageInput, LinkingPageData } from "../packages/shared/src/types/internalLinks.types"

const origin = "https://example.com/"
const evidence = (text = "Nos chaussures rouges accompagnent les promenades de votre quotidien."): LinkingPageData => ({ version: 1, links: [], blocks: [{ text, linkedTexts: [] }], linksTruncated: false, blocksTruncated: false })
const page = (path: string, overrides: Partial<InternalLinkPageInput> = {}): InternalLinkPageInput => ({ url: origin + path, title: path === "shop" ? "Chaussures rouges" : "Conseils pratiques", h1: [], statusCode: 200, isIndexable: true, redirectUrl: null,
  canonicalUrl: null, lang: "fr", internalLinks: 0, internalLinkUrls: [], linkingData: null, ...overrides })

test("linking extraction resolves base URLs, keeps literal plain text and excludes unsafe/non-editorial passages", () => {
  const $ = cheerio.load(`<html><head><base href="/catalogue/"></head><body><nav><a href="shop">Cliquez ici</a><p>Les chaussures rouges dans la navigation ne sont pas une preuve éditoriale.</p></nav><main><p>Nos <strong>chaussures rouges</strong> sont parfaites pour marcher.<script>alert('unsafe')</script><span hidden>secret</span> Découvrez <a href="other#section" rel="external nofollow">la collection</a>.</p><a href="image"><img alt="Chaussures souples"></a><a href="empty" title="Collection hiver"></a><a href="javascript:alert(1)">Unsafe</a><a href="https://evil.test/">Externe</a></main></body></html>`)
  const data = extractLinkingData($, origin + "guide")
  assert.equal(data.links[0].url, origin + "catalogue/shop"); assert.equal(data.links[0].placement, "NAVIGATION")
  assert.equal(data.links[1].url, origin + "catalogue/other"); assert.equal(data.links[1].nofollow, true)
  assert.equal(data.links[2].text, "Chaussures souples"); assert.equal(data.links[3].text, "Collection hiver")
  assert.equal(data.links.length, 4); assert.equal(data.blocks.length, 1)
  assert.equal(data.blocks[0].text, "Nos chaussures rouges sont parfaites pour marcher. Découvrez la collection.")
  assert.deepEqual(data.blocks[0].linkedTexts, ["la collection"])
  assert.equal($("script").length, 1, "Extraction must not mutate the document used by other SEO checks")
  const partial = extractLinkingData(cheerio.load('<main><p>Nos <a href="/other">chaussures</a> rouges accompagnent toutes vos promenades quotidiennes.</p></main>'), origin + "guide")
  assert.equal(buildInternalLinkAnalysis([page("guide", { linkingData: partial }), page("shop")], origin).suggestions.length, 0, "Never wrap a phrase partially contained inside another link")
  const separate = extractLinkingData(cheerio.load('<main><p>Nos chaussures rouges accompagnent toutes vos promenades. Découvrez aussi <a href="/other">le catalogue</a>.</p></main>'), origin + "guide")
  assert.equal(buildInternalLinkAnalysis([page("guide", { linkingData: separate }), page("shop")], origin).suggestions.length, 1, "Unlinked phrases remain usable alongside unrelated anchors")
})

test("linking extraction reports truncation and handles page-level nofollow without storing executable HTML", () => {
  const $ = cheerio.load(`<meta name="robots" content="index, nofollow"><main>${'<a href="/shop">Produit</a>'.repeat(501)}${'<p>Un texte suffisamment long pour constituer un paragraphe de contenu utile.</p>'.repeat(31)}</main>`)
  const data = extractLinkingData($, origin)
  assert.equal(data.links.length, 500); assert.equal(data.linksTruncated, true); assert.equal(data.links[0].nofollow, true)
  assert.equal(data.blocks.length, 30); assert.equal(data.blocksTruncated, true)
  assert.equal(readLinkingData({ version: 1, links: [{ url: "javascript:alert(1)" }], blocks: [{ text: "unsafe", linkedTexts: null }] })?.linksTruncated, true)
  assert.equal(readLinkingData({ version: 2, links: [], blocks: [] }), null)
})

test("indexability uses all generic/Google meta tags, none and scoped HTTP robots headers", () => {
  const meta = googleRobotsMeta(cheerio.load('<meta name="ROBOTS" content="index"><meta name="Googlebot" content="none"><meta name="otherbot" content="all">'))
  assert.equal(readGoogleRobotsRules(meta).noindex, true); assert.equal(readGoogleRobotsRules(meta).nofollow, true)
  const other = readGoogleRobotsRules([], ["otherbot: noindex, nofollow", "googlebot: index, follow"])
  assert.equal(other.noindex, false); assert.equal(other.nofollow, false)
  const blocked = readGoogleRobotsRules(["index"], ["max-snippet: 50, noindex", "googlebot: nofollow"])
  assert.equal(blocked.noindex, true); assert.equal(blocked.nofollow, true)
  assert.equal(readGoogleRobotsRules([], ["noimageindex"]).noindex, false)
  const preview = readGoogleRobotsRules(["max-image-preview: none, max-snippet: -1"], ["googlebot: max-video-preview: none"])
  assert.equal(preview.noindex, false); assert.equal(preview.nofollow, false, "none as a preview setting is not the none robots directive")
})

test("internal graph counts distinct source/target edges, preserves parameters, scopes origin and computes shortest depth", () => {
  const graph = buildInternalLinkAnalysis([
    page("", { internalLinkUrls: [origin + "a", origin + "a#section", origin, "http://example.com/a", "https://example.com.evil.test/a", origin + "unknown"] }),
    page("a", { internalLinkUrls: [origin + "shop?color=red", origin + "shop?color=blue"] }),
    page("shop?color=red", { internalLinkUrls: [origin + "a"] }), page("shop?color=blue"), page("isolated"),
  ], origin)
  assert.equal(graph.summary.edges, 5); assert.equal(graph.summary.unknownTargets, 1)
  assert.equal(graph.nodes.find(node => node.url === origin + "a")!.incoming, 2)
  assert.equal(graph.nodes.find(node => node.url === origin + "shop?color=red")!.depth, 2)
  assert.equal(graph.nodes.find(node => node.url === origin + "isolated")!.depth, null)
  assert.equal(graph.summary.withoutIncoming, 1); assert.equal(graph.summary.unreachable, 1)
  assert.equal(graph.summary.contextualPages, 0); assert.deepEqual(graph.suggestions, [])
  assert.equal(normalizeInternalLinkUrl(origin + "shop/?a=1#part"), origin + "shop/?a=1")
  assert.equal(normalizeInternalLinkUrl("https://user:password@example.com/"), null)
  assert.equal(buildInternalLinkAnalysis([page("a"), page("shop/a"), page("shopping/a")], origin + "shop").summary.pages, 1)
})

test("suggestions use accented literal source phrases, require two title/H1 terms and avoid existing/nested links", () => {
  const source = page("guide", { linkingData: evidence("Découvrez nos Café Équitable pour soutenir les producteurs locaux au quotidien.") })
  const target = page("shop", { title: "Café équitable" })
  let graph = buildInternalLinkAnalysis([source, target], origin, source.url)
  assert.equal(graph.suggestions.length, 1); assert.equal(graph.suggestions[0].anchor, "Café Équitable")
  assert.ok(graph.suggestions[0].excerpt.includes(graph.suggestions[0].anchor))
  assert.deepEqual(graph.suggestions[0].matchedTerms, ["cafe", "equitable"])
  graph = buildInternalLinkAnalysis([{ ...source, internalLinkUrls: [target.url + "#part"] }, target], origin, source.url)
  assert.equal(graph.suggestions.length, 0)
  const linked = evidence("Découvrez nos Café Équitable pour soutenir les producteurs locaux au quotidien."); linked.blocks[0].linkedTexts = ["Équitable"]
  assert.equal(buildInternalLinkAnalysis([{ ...source, linkingData: linked }, target], origin).suggestions.length, 0)
  assert.equal(buildInternalLinkAnalysis([{ ...source, linkingData: evidence("Le café accompagne les producteurs qui recherchent un commerce équitable dans tous les pays.") }, target], origin).suggestions.length, 0, "Distant terms do not supply a usable literal anchor")
})

test("suggestions exclude HTTP errors, noindex, redirects, other canonicals, languages and incomplete outgoing evidence", () => {
  const source = page("guide", { linkingData: evidence() }), target = page("shop")
  for (const overrides of [{ statusCode: 404 }, { isIndexable: false }, { isIndexable: null }, { redirectUrl: origin + "new" }, { redirectUrl: target.url }, { canonicalUrl: origin + "other" }, { lang: "en" }]) {
    assert.equal(buildInternalLinkAnalysis([source, { ...target, ...overrides }], origin).suggestions.length, 0)
  }
  assert.equal(buildInternalLinkAnalysis([source, { ...target, canonicalUrl: "/shop", lang: "fr-FR" }], origin).suggestions.length, 1)
  assert.equal(buildInternalLinkAnalysis([{ ...source, linkingData: { ...evidence(), linksTruncated: true } }, target], origin).suggestions.length, 0)
  assert.equal(buildInternalLinkAnalysis([{ ...source, linkingData: { ...evidence(), pageNofollow: true } }, target], origin).suggestions.length, 0)
  assert.equal(buildInternalLinkAnalysis([{ ...source, internalLinks: 501 }, target], origin).suggestions.length, 0)
})

test("anchor review distinguishes empty/generic/nofollow and bounded analyses declare their coverage", () => {
  const data = evidence(); data.links = [
    { url: origin + "shop", text: "", nofollow: false, placement: "CONTENT" },
    { url: origin + "shop", text: "Cliquez ici", nofollow: false, placement: "NAVIGATION" },
    { url: origin + "shop", text: "Chaussures rouges", nofollow: true, placement: "CONTENT" },
  ]
  const graph = buildInternalLinkAnalysis([page("guide", { linkingData: data }), page("shop")], origin)
  assert.deepEqual(graph.anchorIssues.map(item => item.reason), ["EMPTY", "GENERIC", "NOFOLLOW"])
  assert.equal(graph.summary.edges, 1); assert.equal(graph.suggestions.length, 0)
  const large = buildInternalLinkAnalysis(Array.from({ length: 1001 }, (_, index) => page(`page-${index}`)), origin)
  assert.equal(large.summary.pages, 1000); assert.equal(large.limits.pages, true)
})
