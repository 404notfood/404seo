import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { WordPressClient } from "../apps/api/src/lib/cmsWordPress"
import { PrestaShopClient } from "../apps/api/src/lib/cmsPrestaShop"
import type { CmsFetch, WordPressResource } from "../apps/api/src/lib/cmsWordPress"
import type { CmsCorrectionSummary, ProjectCms } from "../packages/shared/src/types/cms.types"

for (const provider of ["WORDPRESS", "PRESTASHOP"] as const) test(provider + ": tenant/owner isolation, encrypted connection, quotas, exact approved writes, conflict, restore and timeout reconciliation", { skip: !process.env.TEST_DATABASE_URL, timeout: 60_000 }, async () => {
  const presta = provider === "PRESTASHOP"
  const database = new URL(process.env.TEST_DATABASE_URL!)
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = database.href; process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID(); process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.CMS_CREDENTIAL_KEY = randomBytes(32).toString("hex"); process.env.OPENAI_API_KEY = "fixture"; process.env.OPENAI_SEO_MODEL = "fixture"
  const { prisma } = await import("../apps/api/src/lib/prisma")
  const { default: Fastify } = await import("fastify"), { default: cookie } = await import("@fastify/cookie")
  const { default: authPlugin } = await import("../apps/api/src/plugins/auth"), { default: routes } = await import("../apps/api/src/routes/cms")
  const suffix = randomUUID(), own = await prisma.tenant.create({ data: { name: "CMS", slug: "cms-" + suffix, plan: "ENTERPRISE" } })
  const foreign = await prisma.tenant.create({ data: { name: "Other CMS", slug: "other-cms-" + suffix } })
  const user = await prisma.user.create({ data: { tenantId: own.id, name: "Editor", email: suffix + "@example.com", role: "MEMBER" } })
  const colleague = await prisma.user.create({ data: { tenantId: own.id, name: "Colleague", email: "colleague-" + suffix + "@example.com" } })
  const stranger = await prisma.user.create({ data: { tenantId: foreign.id, name: "Stranger", email: "stranger-" + suffix + "@example.com" } })
  const session = await prisma.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } })
  const project = await prisma.project.create({ data: { tenantId: own.id, userId: user.id, name: "Shop", domain: "https://example.com/" } })
  const other = await prisma.project.create({ data: { tenantId: foreign.id, userId: stranger.id, name: "Other shop", domain: project.domain } })
  const peer = await prisma.project.create({ data: { tenantId: own.id, userId: colleague.id, name: "Peer shop", domain: project.domain } })
  const priorConfig = await prisma.planConfig.findUnique({ where: { plan: "ENTERPRISE" } })
  await prisma.planConfig.upsert({ where: { plan: "ENTERPRISE" }, create: { plan: "ENTERPRISE", displayName: "CMS test", price: 0, auditQuota: 1, pageQuota: 1, projectQuota: 1, userQuota: 1, featureAI: true, featureCmsCorrections: true, cmsMonthlyQuota: 10 },
    update: { featureAI: true, featureCmsCorrections: true, cmsMonthlyQuota: 10 } })
  const resource: WordPressResource = { id: 1, url: "https://example.com/page", kind: presta ? "product" : "page", title: "Chaussures rouges", content: "Chaussures pour promenade.",
    seoTitle: presta ? "" : null, seoDescription: presta ? "" : null, revision: "a".repeat(64), operationId: "" }
  let remoteScope = "1:1"
  let writes = 0, calls = 0, timeoutAfterWrite = false, timeoutBeforeWrite = false, clock = 1
  let holdWrite: Promise<void> | undefined, announceHeld: (() => void) | undefined
  const cancelled = new Set<string>()
  const fetch: CmsFetch = async (url, options) => {
    calls++
    let data: unknown
    const address = new URL(url), action = address.searchParams.get("action")
    const path = presta ? "/" + (action === "read" || action === "write" ? "resources/1" : action) : address.pathname
    assert.equal(options?.authenticated, true); assert.ok(options.headers?.Authorization?.startsWith(presta ? "Bearer " : "Basic "))
    if (path.endsWith("/connection")) data = { version: 1, siteUrl: project.domain, label: "<b>Shop</b>", scope: remoteScope }
    else if (path.endsWith("/resources")) data = { resources: [{ ...resource }], hasMore: false }
    else if (path.endsWith("/reconcile")) {
      const body = JSON.parse(options!.body!) as { operationId: string }
      if (resource.operationId !== body.operationId) cancelled.add(body.operationId)
      data = { ...resource }
    } else if (options?.method === "POST") {
      const body = JSON.parse(options.body!) as { revision: string; operationId: string; seoTitle: string | null; seoDescription: string | null }
      if (holdWrite) { const pending = holdWrite; holdWrite = undefined; announceHeld?.(); await pending }
      if (timeoutBeforeWrite) { timeoutBeforeWrite = false; throw new Error("socket timeout") }
      if (cancelled.has(body.operationId) || body.revision !== resource.revision) {
        return { url, status: 409, ok: false, headers: {}, body: Buffer.alloc(0), text: async () => "" }
      }
      writes++; Object.assign(resource, { seoTitle: body.seoTitle, seoDescription: body.seoDescription, operationId: body.operationId, revision: (++clock).toString(16).padStart(64, "0") })
      if (timeoutAfterWrite) { timeoutAfterWrite = false; throw new Error("socket timeout") }
      data = { ...resource }
    } else data = { ...resource }
    if (presta && path !== "/connection") {
      if (path === "/resources") data = { resources: [{ ...resource, scope: remoteScope }], hasMore: false }
      else data = { ...resource, scope: remoteScope }
    }
    const body = Buffer.from(JSON.stringify(data))
    return { status: 200, ok: true, url, headers: {}, body, text: async () => body.toString() }
  }
  let generated = 0
  const server = Fastify(), headers = { authorization: "Bearer " + session.token }
  try {
    await server.register(cookie); await server.register(authPlugin); await server.register(routes, {
      clientFactory: (url, credentials) => new WordPressClient(url, credentials, fetch),
      prestaFactory: (url, credentials, scope) => new PrestaShopClient(url, credentials, scope, fetch),
      generate: async () => ({ seoTitle: "Chaussures rouges " + ++generated, seoDescription: "Chaussures rouges pour promenade.", reason: "Titre descriptif fondé sur le contenu." }),
    })
    const endpoint = "/api/projects/" + project.id + "/cms"
    const inject = (path: string, payload?: object, method: "GET" | "POST" | "DELETE" = "POST") => server.inject({ url: endpoint + path, method, payload, headers })
    const accesses = (letter: string) => presta ? { provider, siteUrl: project.domain, token: letter.repeat(64) } : { siteUrl: project.domain, username: "editor", applicationPassword: letter.repeat(24) }
    const draft = async () => {
      const response = await inject("/corrections", { resourceId: 1, mode: "SEO" }); assert.equal(response.statusCode, 200, response.body)
      return response.json<CmsCorrectionSummary>()
    }
    assert.equal((await server.inject({ url: endpoint })).statusCode, 401)
    for (const id of [other.id, peer.id]) assert.equal((await server.inject({ url: "/api/projects/" + id + "/cms", headers })).statusCode, 404)
    assert.equal((await inject("/connection", { siteUrl: "http://example.com/", username: "editor", applicationPassword: "a".repeat(24) })).statusCode, 400)
    assert.equal(calls, 0)
    const connected = await inject("/connection", accesses("a"))
    assert.equal(connected.statusCode, 200, connected.body); assert.ok(!connected.body.includes("credentials"))
    const connection = await prisma.cmsConnection.findFirstOrThrow({ where: { tenantId: own.id, projectId: project.id } })
    assert.ok(!connection.credentials.includes("a".repeat(24)))
    const overview = await inject("", undefined, "GET"); assert.equal(overview.json<ProjectCms>().connection!.label, "Shop")
    assert.ok(!overview.body.includes("credentials")); assert.ok(!overview.body.includes("applicationPassword"))
    await prisma.cmsConnection.update({ where: { id: connection.id }, data: { siteUrl: "https://other-example.com/" } })
    const beforeTamper = calls
    assert.equal((await inject("/resources", undefined, "GET")).statusCode, 503)
    assert.equal(calls, beforeTamper, "Changing a stored destination cannot forward decrypted credentials")
    await prisma.cmsConnection.update({ where: { id: connection.id }, data: { siteUrl: project.domain } })
    if (presta) {
      await prisma.cmsConnection.update({ where: { id: connection.id }, data: { scope: "1:2" } })
      const beforeScope = calls
      assert.equal((await inject("/resources?kind=product", undefined, "GET")).statusCode, 503)
      assert.equal(calls, beforeScope, "Stored scope tampering must not expose a key")
      await prisma.cmsConnection.update({ where: { id: connection.id }, data: { scope: "1:1" } })
      remoteScope = "1:2"
      assert.equal((await inject("/corrections", { resourceId: 1, mode: "SEO" })).statusCode, 409)
      remoteScope = "1:1"
    }
    await assert.rejects(prisma.cmsConnection.create({ data: { tenantId: foreign.id, projectId: project.id, credentials: "encrypted", label: "Invalid", siteUrl: project.domain } }), { code: "P2003" })
    assert.equal((await inject("/resources?kind=invalid", undefined, "GET")).statusCode, 400)
    assert.equal((await inject("/resources?kind=" + resource.kind, undefined, "GET")).json<{ resources: WordPressResource[] }>().resources.length, 1)
    const first = await draft(); assert.equal(first.status, "DRAFT"); assert.equal(writes, 0)
    assert.equal((await inject("/corrections/" + first.id + "/apply", { seoTitle: "Replace approved value" })).statusCode, 400)
    assert.equal((await inject("/corrections/" + first.id + "/apply")).json<CmsCorrectionSummary>().status, "APPLIED")
    assert.equal(resource.seoTitle, first.afterTitle); assert.equal(writes, 1)
    assert.equal((await inject("/corrections/" + first.id + "/apply")).statusCode, 200); assert.equal(writes, 1)
    assert.equal((await inject("/corrections/" + first.id + "/restore")).json<CmsCorrectionSummary>().status, "RESTORED")
    assert.equal(resource.seoTitle, presta ? "" : null); assert.equal(resource.seoDescription, presta ? "" : null); assert.equal(writes, 2)
    const conflicting = await draft(); resource.revision = "b".repeat(64)
    assert.equal((await inject("/corrections/" + conflicting.id + "/apply")).statusCode, 409); assert.equal(writes, 2)
    const uncertain = await draft(); timeoutAfterWrite = true
    assert.equal((await inject("/corrections/" + uncertain.id + "/apply")).statusCode, 502)
    assert.equal((await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: uncertain.id } })).status, "UNCERTAIN")
    assert.equal((await inject("/connection", undefined, "DELETE")).statusCode, 409)
    if (presta) {
      remoteScope = "1:2"
      assert.equal((await inject("/connection", accesses("b"))).statusCode, 409, "Cannot change scope while a publication is uncertain")
      remoteScope = "1:1"
    }
    assert.equal((await inject("/connection", accesses("b"))).statusCode, 200)
    assert.equal((await prisma.cmsConnection.findFirstOrThrow({ where: { projectId: project.id, tenantId: own.id, disconnectedAt: null } })).id, connection.id, "Credential rotation preserves the connection and backups")
    const blocked = await draft(); assert.equal((await inject("/corrections/" + blocked.id + "/apply")).statusCode, 409)
    const beforeReconcile = writes
    assert.equal((await inject("/corrections/" + uncertain.id + "/reconcile")).json<CmsCorrectionSummary>().status, "APPLIED"); assert.equal(writes, beforeReconcile)
    await inject("/corrections/" + uncertain.id + "/restore")
    const notSent = await draft(); timeoutBeforeWrite = true
    assert.equal((await inject("/corrections/" + notSent.id + "/apply")).statusCode, 502)
    assert.equal((await inject("/corrections/" + notSent.id + "/reconcile")).json<CmsCorrectionSummary>().status, "DRAFT")
    const cancelledAttempt = (await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: notSent.id } })).operationId!
    assert.ok(cancelled.has(cancelledAttempt))
    // A new approval allocates a fresh ID; the delayed previous request remains cancelled.
    assert.equal((await inject("/corrections/" + notSent.id + "/apply")).statusCode, 200)
    assert.notEqual((await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: notSent.id } })).operationId, cancelledAttempt)
    assert.equal((await inject("/corrections/" + notSent.id + "/restore")).statusCode, 200)
    const racing = await draft()
    let releaseHeld: (() => void) | undefined
    holdWrite = new Promise(resolve => { releaseHeld = resolve })
    const held = new Promise<void>(resolve => { announceHeld = resolve })
    const delayedResponse = inject("/corrections/" + racing.id + "/apply")
    await held
    assert.equal((await inject("/corrections/" + racing.id + "/reconcile")).json<CmsCorrectionSummary>().status, "DRAFT")
    assert.equal((await inject("/corrections/" + racing.id + "/apply")).json<CmsCorrectionSummary>().status, "APPLIED")
    releaseHeld!()
    assert.equal((await delayedResponse).statusCode, 409)
    assert.equal((await prisma.cmsCorrection.findUniqueOrThrow({ where: { id: racing.id } })).status, "APPLIED", "Late failure must not overwrite the new successful attempt")
    assert.equal((await inject("/corrections/" + racing.id + "/restore")).statusCode, 200)
    const revoked = await draft()
    await prisma.tenantFeature.create({ data: { tenantId: own.id, feature: "cms_corrections", enabled: false, setBy: user.id } })
    const beforeRevoked = writes
    assert.equal((await inject("/corrections/" + revoked.id + "/apply")).statusCode, 403); assert.equal(writes, beforeRevoked)
    assert.equal((await inject("/corrections", { resourceId: 1, mode: "SEO" })).statusCode, 403)
    await prisma.tenantFeature.deleteMany({ where: { tenantId: own.id } })
    await prisma.planConfig.update({ where: { plan: "ENTERPRISE" }, data: { cmsMonthlyQuota: generated + 1 } })
    const concurrent = await Promise.all([inject("/corrections", { resourceId: 1, mode: "SEO" }), inject("/corrections", { resourceId: 1, mode: "SEO" })])
    assert.deepEqual(concurrent.map(response => response.statusCode).sort(), [200, 403])
    await prisma.user.update({ where: { id: user.id }, data: { role: "GUEST" } })
    assert.equal((await inject("/resources", undefined, "GET")).statusCode, 403)
    assert.equal((await inject("/connection", undefined, "DELETE")).statusCode, 403)
    assert.equal((await inject("", undefined, "GET")).statusCode, 200)
    await prisma.user.update({ where: { id: user.id }, data: { role: "MEMBER" } })
    assert.equal((await inject("/connection", undefined, "DELETE")).statusCode, 200)
    assert.equal((await prisma.cmsConnection.findUniqueOrThrow({ where: { id: connection.id } })).credentials, "")
  } finally {
    await server.close()
    await prisma.tenant.deleteMany({ where: { id: { in: [own.id, foreign.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, colleague.id, stranger.id] } } })
    if (priorConfig) await prisma.planConfig.update({ where: { plan: "ENTERPRISE" }, data: { featureAI: priorConfig.featureAI, featureCmsCorrections: priorConfig.featureCmsCorrections, cmsMonthlyQuota: priorConfig.cmsMonthlyQuota } })
    else await prisma.planConfig.deleteMany({ where: { plan: "ENTERPRISE" } })
    await prisma.$disconnect()
  }
})
