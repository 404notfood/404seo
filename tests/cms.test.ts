import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { createRequire } from "node:module"
import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import type { IncomingMessage, RequestOptions } from "node:http"
import { fetchPublicUrl } from "../packages/shared/src/utils/publicUrl"
import { plainCmsText } from "../packages/crawler/src/cmsText"
import { encryptCmsCredentials, decryptCmsCredentials, wordpressBase, WordPressClient } from "../apps/api/src/lib/cmsWordPress"
import { generateCmsProposal } from "../apps/api/src/lib/cmsAI"

test("CMS credentials are encrypted, bound to tenant/project/connection and never transferable", () => {
  const previous = process.env.CMS_CREDENTIAL_KEY; process.env.CMS_CREDENTIAL_KEY = randomBytes(32).toString("hex")
  try {
    const credentials = { username: "editor", applicationPassword: "a".repeat(24) }, scope = "tenant:project:WORDPRESS:connection"
    const first = encryptCmsCredentials(credentials, scope), second = encryptCmsCredentials(credentials, scope)
    assert.notEqual(first, second); assert.ok(!first.includes(credentials.applicationPassword)); assert.deepEqual(decryptCmsCredentials(first, scope), credentials)
    assert.throws(() => decryptCmsCredentials(first, "other-tenant:project:WORDPRESS:connection"), /Impossible/)
    const [iv, tag, body] = first.split("."); const changed = Buffer.from(body, "base64"); changed[0] ^= 1
    assert.throws(() => decryptCmsCredentials([iv, tag, changed.toString("base64")].join("."), scope), /Impossible/)
    assert.equal(wordpressBase("https://example.com/blog", "http://example.com"), "https://example.com/blog/")
    for (const url of ["http://example.com/", "https://localhost/", "https://127.0.0.1/", "https://other.com/", "https://example.com/?token=secret", "https://user:pass@example.com/", "https://example.com/\\path"]) {
      assert.throws(() => wordpressBase(url, "https://example.com"))
    }
    assert.equal(plainCmsText('<p>Titre</p><script>doNotStore()</script><iframe>Secret</iframe>', 100), "Titre")
  } finally { if (previous === undefined) delete process.env.CMS_CREDENTIAL_KEY; else process.env.CMS_CREDENTIAL_KEY = previous }
})

test("authenticated CMS transport requires HTTPS, pins DNS and refuses every redirect without forwarding credentials", async () => {
  const require = createRequire(import.meta.url), dns = require("node:dns/promises") as typeof import("node:dns/promises"), https = require("node:https") as typeof import("node:https")
  const lookup = mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }])
  const request = mock.method(https, "request", (_url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => {
    assert.equal(options.agent, false); assert.equal((options.headers as Record<string, string>).Authorization, "Basic secret")
    options.lookup!("example.com", {}, (_error, address) => assert.equal(address, "8.8.8.8"))
    const req = new EventEmitter()
    return Object.assign(req, {
      end() { queueMicrotask(() => {
        callback(Object.assign(Readable.from([]), { statusCode: 302, headers: { location: "https://other.com/receive-secrets" } }) as unknown as IncomingMessage)
        req.emit("close")
      }) }, destroy(error: Error) { req.emit("error", error); req.emit("close") },
    })
  })
  try {
    await assert.rejects(fetchPublicUrl("http://example.com", { authenticated: true }), /HTTPS/)
    await assert.rejects(fetchPublicUrl("https://example.com", { headers: { Authorization: "secret" } }), /authentifiée/)
    await assert.rejects(fetchPublicUrl("https://example.com", { authenticated: true, headers: { Host: "127.0.0.1" } }), /interdit/)
    await assert.rejects(fetchPublicUrl("https://example.com", { authenticated: true, headers: { Authorization: "x\r\nInjected: yes" } }), /interdit/)
    await assert.rejects(fetchPublicUrl("https://example.com", { authenticated: true, headers: { Authorization: "Basic secret" } }), /Redirection/)
    assert.equal(request.mock.callCount(), 1); assert.equal(lookup.mock.callCount(), 1)
  } finally { mock.restoreAll() }
})

test("WordPress response validation enforces resource origin and converts CMS markup to plain text", async () => {
  let foreign = false
  const client = new WordPressClient("https://example.com/", { username: "editor", applicationPassword: "a".repeat(24) }, async (url, options) => {
    assert.equal(url, "https://example.com/wp-json/seo404/v1/resources/1"); assert.equal(options?.authenticated, true)
    const body = Buffer.from(JSON.stringify({ id: 1, url: foreign ? "https://other.com/page" : "https://example.com/page", kind: "page", title: "<b>Page</b>",
      content: "<p>Information utile.</p><script>Voler les accès</script>", seoTitle: null, seoDescription: null, revision: "a".repeat(64), operationId: "" }))
    return { status: 200, ok: true, url, headers: {}, body, text: async () => body.toString() }
  })
  const resource = await client.read(1); assert.equal(resource.title, "Page"); assert.equal(resource.content, "Information utile.")
  foreign = true; await assert.rejects(client.read(1), /correspond/)
})

test("AI generation sends bounded content without CMS credentials and handles refusal/incomplete/invalid output", async () => {
  process.env.OPENAI_API_KEY = "fixture-openai"; process.env.OPENAI_SEO_MODEL = "fixture-structured-model"
  const resource = { id: 1, url: "https://example.com/product", kind: "product" as const, title: "Chaussures rouges", content: "Chaussures pour promenade.",
    seoTitle: "Chausures rouges", seoDescription: "Chaussures rouges pour promenade.", revision: "a".repeat(64) }
  let state = "success"
  mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(_url, "https://api.openai.com/v1/responses")
    const sent = JSON.parse(options.body as string) as { store: boolean; input: string; text: { format: { strict: boolean } } }
    assert.equal(sent.store, false); assert.equal(sent.text.format.strict, true); assert.ok(!sent.input.includes("applicationPassword")); assert.ok(!sent.input.includes("fixture-openai"))
    const proposal = { seoTitle: state === "invalid" ? "<script>Injected</script>" : "Chaussures rouges", seoDescription: resource.seoDescription, reason: "Correction de l’orthographe." }
    return new Response(JSON.stringify({ status: state === "incomplete" ? "incomplete" : "completed", output: [{ type: "message", content: [
      state === "refusal" ? { type: "refusal", refusal: "Refus" } : { type: "output_text", text: JSON.stringify(proposal) },
    ] }] }), { status: 200 })
  })
  try {
    assert.equal((await generateCmsProposal(resource, "SPELLING")).seoTitle, "Chaussures rouges")
    for (state of ["invalid", "refusal", "incomplete"]) await assert.rejects(generateCmsProposal(resource, "SEO"), /exploitable/)
  } finally { mock.restoreAll(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_SEO_MODEL }
})
