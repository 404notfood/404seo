import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import type { ProjectUrlInventory, SitemapInventory } from "../packages/shared/src/types/urlInventory.types"

test("URL inventory: ownership, atomic imports, leases, retention, complete-audit presence and GSC lifecycle", { skip: !process.env.TEST_DATABASE_URL, timeout: 90_000 }, async () => {
  const database = new URL(process.env.TEST_DATABASE_URL!)
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = database.href; process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID(); process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  const { prisma } = await import("../apps/api/src/lib/prisma")
  const { default: Fastify } = await import("fastify"), { default: cookie } = await import("@fastify/cookie")
  const { default: authPlugin } = await import("../apps/api/src/plugins/auth"), { default: routes } = await import("../apps/api/src/routes/url-inventory")
  const suffix = randomUUID(), origin = "https://example.com/"
  const own = await prisma.tenant.create({ data: { name: "Inventory test", slug: "inventory-" + suffix } })
  const foreign = await prisma.tenant.create({ data: { name: "Other inventory", slug: "other-inventory-" + suffix } })
  const user = await prisma.user.create({ data: { tenantId: own.id, name: "Tester", email: "inventory-" + suffix + "@example.com", role: "MEMBER" } })
  const colleague = await prisma.user.create({ data: { tenantId: own.id, name: "Colleague", email: "inventory-colleague-" + suffix + "@example.com" } })
  const stranger = await prisma.user.create({ data: { tenantId: foreign.id, name: "Stranger", email: "inventory-stranger-" + suffix + "@example.com" } })
  const session = await prisma.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } })
  const project = await prisma.project.create({ data: { tenantId: own.id, userId: user.id, name: "Shop", domain: origin } })
  const other = await prisma.project.create({ data: { tenantId: foreign.id, userId: stranger.id, name: "Other", domain: origin } })
  const colleagueProject = await prisma.project.create({ data: { tenantId: own.id, userId: colleague.id, name: "Colleague", domain: origin } })
  const account = await prisma.googleAccount.create({ data: { tenantId: own.id, googleId: suffix, googleEmail: user.email, accessToken: "fixture", refreshToken: "fixture", tokenExpiry: new Date(Date.now() + 3600000), scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] } })
  let inventory: SitemapInventory = {
    version: 1, roots: [origin + "map.xml"], documents: [{ url: origin + "map.xml", status: "OK", httpStatus: 200, kind: "URLSET", urlCount: 31 }],
    pages: ["", "isolated", "linked-missing", "excluded", "unassessed", ...Array.from({ length: 26 }, (_, i) => "missing-" + i)].map(path => ({ url: origin + path, documentIndexes: [0] })),
    omittedUrls: 0, limits: { documents: false, urls: false, bytes: false, time: false, depth: false, stored: false },
  }
  let calls = 0, fail = false
  let hold: Promise<void> | undefined, unblock: (() => void) | undefined, entered: (() => void) | undefined
  const server = Fastify(), headers = { authorization: "Bearer " + session.token }, base = "/api/projects/" + project.id + "/url-inventory"
  const post = (path = base, payload: object = {}) => server.inject({ method: "POST", url: path + "/sitemaps/sync", headers, payload })
  const get = async (query = "") => (await server.inject({ url: base + query, headers })).json<ProjectUrlInventory>()
  try {
    await server.register(cookie); await server.register(authPlugin)
    await server.register(routes, { collect: async domain => {
      calls++; assert.equal(domain, origin); if (fail) throw new Error("Unavailable")
      entered?.(); if (hold) await hold
      return structuredClone(inventory)
    } })
    assert.equal((await server.inject({ url: base })).statusCode, 401)
    for (const inaccessible of [other, colleagueProject]) {
      const path = "/api/projects/" + inaccessible.id + "/url-inventory"
      assert.equal((await server.inject({ url: path, headers })).statusCode, 404); assert.equal((await post(path)).statusCode, 404)
    }
    assert.equal(calls, 0)
    for (const url of ["http://127.0.0.1/map.xml", "https://other.example/map.xml", "https://user:pass@example.com/map.xml"])
      assert.equal((await post(base, { sitemapUrl: url })).statusCode, 400)
    assert.equal(calls, 0)
    assert.equal((await server.inject({ url: base + "?page=-1", headers })).statusCode, 400)
    assert.equal((await get()).audit, null)
    await prisma.user.update({ where: { id: user.id }, data: { role: "GUEST" } })
    assert.equal((await post()).statusCode, 403); assert.equal((await server.inject({ url: base, headers })).statusCode, 200)
    await prisma.user.update({ where: { id: user.id }, data: { role: "MEMBER" } })
    assert.equal((await post()).statusCode, 200)
    let overview = await get("?mode=all")
    assert.equal(overview.total, 31); assert.equal(overview.pageCount, 2)
    assert.ok(overview.items.every(row => row.state === "NO_AUDIT" && row.incoming === null))
    const audit = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: origin, status: "COMPLETED", completedAt: new Date() } })
    await prisma.auditPage.createMany({ data: [
      { tenantId: own.id, auditId: audit.id, url: origin, h1: [], schemaTypes: [], statusCode: 200, isIndexable: true, internalLinkUrls: [origin + "linked-missing"] },
      { tenantId: own.id, auditId: audit.id, url: origin + "isolated", h1: [], schemaTypes: [], title: "Chaussures rouges", statusCode: 200, isIndexable: true },
      { tenantId: own.id, auditId: audit.id, url: origin + "excluded", h1: [], schemaTypes: [], statusCode: 404, isIndexable: false },
    ] })
    const snapshot = await prisma.searchConsoleSnapshot.create({ data: { tenantId: own.id, projectId: project.id, googleAccountId: account.id, propertyUrl: "sc-domain:example.com", startDate: "2026-09-01", endDate: "2026-09-28" } })
    await prisma.searchConsolePageMetric.createMany({ data: [
      { tenantId: own.id, snapshotId: snapshot.id, pageUrl: origin + "gsc-only", clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      { tenantId: own.id, snapshotId: snapshot.id, pageUrl: origin + "isolated", clicks: 0, impressions: 0, ctr: 0, position: 0 },
    ] })
    overview = await get()
    assert.equal(overview.items[0].state, "NO_INCOMING"); assert.equal(overview.items[0].search!.clicks, 0)
    assert.equal(overview.summary.investigate, 29)
    const linked = await get("?mode=linked-not-crawled")
    assert.equal(linked.items[0].url, origin + "linked-missing"); assert.equal(linked.items[0].incoming, 1)
    assert.equal((await get("?mode=all&q=CHAUSSURES")).items[0].url, origin + "isolated")
    assert.equal((await get("?page=2")).items.length, 4)
    const savedId = overview.sitemap!.id
    fail = true; assert.equal((await post()).statusCode, 502); fail = false
    assert.equal((await get()).sitemap!.id, savedId)
    const valid = structuredClone(inventory)
    inventory.pages[0].documentIndexes = [999]; assert.equal((await post()).statusCode, 502)
    inventory = structuredClone(valid); inventory.pages[0].url = "https://other.example/a"; assert.equal((await post()).statusCode, 502)
    inventory = structuredClone(valid); inventory.limits.depth = true
    assert.equal((await post()).json().partial, true)
    inventory = valid
    hold = new Promise(resolve => { unblock = resolve }); const collecting = new Promise<void>(resolve => { entered = resolve })
    const pending = post(); await collecting
    assert.equal((await post()).statusCode, 409); unblock!(); assert.equal((await pending).statusCode, 200)
    hold = undefined; entered = undefined
    await prisma.project.update({ where: { id: project.id }, data: { sitemapSyncStartedAt: new Date(Date.now() - 181_000) } })
    assert.equal((await post()).statusCode, 200)
    hold = new Promise(resolve => { unblock = resolve }); const replaced = new Promise<void>(resolve => { entered = resolve })
    const obsolete = post(); await replaced
    const replacementLease = new Date(Date.now() + 1000), countBefore = await prisma.sitemapSnapshot.count({ where: { projectId: project.id, tenantId: own.id } })
    await prisma.project.update({ where: { id: project.id }, data: { sitemapSyncStartedAt: replacementLease } })
    unblock!(); assert.equal((await obsolete).statusCode, 502)
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).sitemapSyncStartedAt!.getTime(), replacementLease.getTime())
    assert.equal(await prisma.sitemapSnapshot.count({ where: { projectId: project.id, tenantId: own.id } }), countBefore)
    hold = undefined; entered = undefined
    await prisma.project.update({ where: { id: project.id }, data: { sitemapSyncStartedAt: null } })
    for (let i = 0; i < 6; i++) assert.equal((await post()).statusCode, 200)
    assert.equal(await prisma.sitemapSnapshot.count({ where: { projectId: project.id, tenantId: own.id } }), 5)
    await assert.rejects(prisma.sitemapSnapshot.create({ data: { tenantId: foreign.id, projectId: project.id, pageCount: 0, data: {} } }), { code: "P2003" })
    await prisma.googleAccount.deleteMany({ where: { id: account.id, tenantId: own.id } })
    overview = await get("?mode=all&q=gsc-only"); assert.equal(overview.searchConsole, null); assert.equal(overview.total, 0)
    const large = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: origin, status: "COMPLETED", completedAt: new Date(Date.now() + 1000) } })
    await prisma.auditPage.createMany({ data: [
      { tenantId: own.id, auditId: large.id, url: origin, h1: [], schemaTypes: [], statusCode: 200, isIndexable: true, crawledAt: new Date(1000) },
      { tenantId: own.id, auditId: large.id, url: origin + "heavy", title: "x".repeat(8 * 1024 * 1024), h1: [], schemaTypes: [], crawledAt: new Date(2000) },
      { tenantId: own.id, auditId: large.id, url: origin + "unassessed", h1: [], schemaTypes: [], statusCode: 200, isIndexable: true, crawledAt: new Date(3000) },
    ] })
    overview = await get("?mode=all&q=unassessed")
    assert.equal(overview.coverage.graphPartial, true); assert.equal(overview.items[0].state, "UNASSESSED"); assert.equal(overview.items[0].incoming, null)
    await prisma.audit.update({ where: { id: large.id }, data: { deletedAt: new Date() } })
    assert.equal((await get()).audit!.id, audit.id)
    hold = new Promise(resolve => { unblock = resolve }); const deleting = new Promise<void>(resolve => { entered = resolve })
    const deleted = post(); await deleting
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } })
    unblock!(); assert.equal((await deleted).statusCode, 502)
    assert.equal((await server.inject({ url: base, headers })).statusCode, 404)
  } finally {
    unblock?.(); await server.close()
    await prisma.tenant.deleteMany({ where: { id: { in: [own.id, foreign.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, colleague.id, stranger.id] } } }); await prisma.$disconnect()
  }
})
