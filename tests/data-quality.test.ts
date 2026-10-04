import { test } from "node:test"
import assert from "node:assert/strict"
import { extractAiMention } from "../apps/api/src/lib/aiVisibility"
import { parseGoogleRankHtml } from "../packages/crawler/src/rankResults"
import { parseBacklinkResponse } from "../apps/api/src/lib/backlinkProvider"

test("AI mentions: exact domain boundaries and distinct citation order without matching lookalike domains", () => {
  assert.equal(extractAiMention("example.com.evil.org et notexample.com", "example.com").mentioned, false)
  const result = extractAiMention("Outils : https://first.org puis first.org et https://www.example.com/seo", "example.com")
  assert.equal(result.mentioned, true); assert.equal(result.position, 2)
  assert.equal(extractAiMention("Le site docs.example.com est cité.", "example.com").mentioned, true)
})

test("Rank evidence: unique organic results, ads excluded, blocked/empty pages fail instead of inventing an unranked result", () => {
  const html = '<div id="search"><div id="rso"><div data-text-ad><a href="https://example.com/ad"><h3>Annonce</h3></a></div><div><a href="https://other.com/"><h3>Autre</h3></a></div><div class="g"><div class="g"><a href="https://example.com/page"><h3>Client</h3></a></div></div><a href="https://example.com/page"><h3>Doublon</h3></a><a href="https://youtube.com/watch?v=1"><h3>Vidéo</h3></a></div></div>'
  assert.deepEqual(parseGoogleRankHtml(html, "https://example.com/"), { position: 2, url: "https://example.com/page", title: "Client", resultCount: 3 })
  assert.equal(parseGoogleRankHtml(html, "missing.com").position, null)
  assert.throws(() => parseGoogleRankHtml('<form action="/sorry/"><div id="captcha"></div></form>', "example.com"), /blocked/)
  assert.throws(() => parseGoogleRankHtml('<div id="rso"></div>', "example.com"), /no verifiable/)
})
test("Backlink evidence: explicit provider success, bounded sample, correct targets and no fabricated domain authority", () => {
  const response = { status_code: 20000, tasks: [{ status_code: 20000, result: [{ total_count: 200, items: [{ url_from: "https://source.fr/article", url_to: "https://example.com/page", anchor: "<b>Client</b>", dofollow: true, domain_from_rank: 950 }] }] }] }
  const data = parseBacklinkResponse(response, "example.com")
  assert.equal(data.totalAvailable, 200); assert.equal(data.backlinks[0].anchor, "Client"); assert.ok(!("domainRating" in data.backlinks[0]))
  assert.throws(() => parseBacklinkResponse({ ...response, status_code: 40000 }, "example.com"))
  assert.throws(() => parseBacklinkResponse(response, "other.com"), /Wrong/)
  assert.throws(() => parseBacklinkResponse({}, "example.com"))
})
