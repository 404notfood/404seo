import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import type { ActionPlan } from "../packages/shared/src/types/actionPlan.types"

test("action plan: real database isolation, atomic GSC imports and recrawl verification", { skip: !process.env.TEST_DATABASE_URL, timeout: 120_000 }, async () => {
  const target = new URL(process.env.TEST_DATABASE_URL!)
  assert.equal(target.hostname, "127.0.0.1")
  assert.equal(target.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = target.href
  process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID()
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  const { prisma } = await import("../apps/api/src/lib/prisma")
  const { default: Fastify } = await import("fastify")
  const { default: cookie } = await import("@fastify/cookie")
  const { default: authPlugin } = await import("../apps/api/src/plugins/auth")
  const { default: routes } = await import("../apps/api/src/routes/action-plan")
  const { default: aggregationRoutes } = await import("../apps/api/src/routes/aggregation")
  const suffix = randomUUID()
  const own = await prisma.tenant.create({ data: { name: "Action test", slug: `action-${suffix}` } })
  const other = await prisma.tenant.create({ data: { name: "Foreign action test", slug: `foreign-action-${suffix}` } })
  const user = await prisma.user.create({ data: { name: "Action tester", email: `action-${suffix}@example.com`, tenantId: own.id, role: "MEMBER" } })
  const foreignUser = await prisma.user.create({ data: { name: "Foreign tester", email: `foreign-action-${suffix}@example.com`, tenantId: other.id, role: "MEMBER" } })
  const session = await prisma.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } })
  const project = await prisma.project.create({ data: { tenantId: own.id, userId: user.id, name: "Example", domain: "https://example.com/" } })
  const foreignProject = await prisma.project.create({ data: { tenantId: other.id, userId: foreignUser.id, name: "Foreign", domain: "https://example.com/" } })
  const account = await prisma.googleAccount.create({ data: { tenantId: own.id, googleId: `test-${suffix}`, googleEmail: user.email, accessToken: "fixture", refreshToken: "fixture", tokenExpiry: new Date(Date.now() + 3600_000), scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] } })
  const foreignAccount = await prisma.googleAccount.create({ data: { tenantId: other.id, googleId: `foreign-${suffix}`, googleEmail: foreignUser.email, accessToken: "fixture", refreshToken: "fixture", tokenExpiry: new Date(Date.now() + 3600_000), scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] } })
  const audit = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: project.domain, status: "COMPLETED", createdAt: new Date(Date.now() - 60_000), completedAt: new Date(Date.now() - 1000) } })
  const createPage = async (auditId: string, url: string, status: "PASS" | "FAIL") => prisma.auditPage.create({ data: {
    tenantId: own.id, auditId, url, h1: [], schemaTypes: [], results: { create: { checkName: "title", category: "ON_PAGE", status, score: status === "PASS" ? 100 : 0, priority: "HIGH", effort: "LOW", message: status === "PASS" ? "Titre valide" : "Titre absent", value: status === "PASS" ? "Exemple" : "", expected: "Un titre descriptif" } },
  } })
  await createPage(audit.id, "https://example.com/a", "FAIL")
  await createPage(audit.id, "https://example.com/b", "FAIL")
  const old = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: project.domain, status: "COMPLETED", completedAt: new Date(Date.now() - 86400_000) } })
  await createPage(old.id, "https://example.com/old", "FAIL")
  const headers = { authorization: `Bearer ${session.token}` }
  let providerCalls = 0
  let failFetch = false
  let unblock: (() => void) | undefined
  let entered: (() => void) | undefined
  let hold: Promise<void> | undefined
  const server = Fastify()
  const base = `/api/projects/${project.id}`
  try {
    await server.register(cookie)
    await server.register(authPlugin)
    await server.register(routes, { provider: {
      async listProperties(tenantId, accountId) {
        providerCalls++
        assert.equal(tenantId, own.id)
        assert.equal(accountId, account.id)
        return [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }]
      },
      async fetchPages(tenantId, accountId, property, startDate, endDate) {
        assert.equal(tenantId, own.id)
        assert.equal(accountId, account.id)
        assert.equal(property, "sc-domain:example.com")
        assert.match(startDate, /^\d{4}-\d{2}-\d{2}$/)
        assert.equal((Date.parse(endDate) - Date.parse(startDate)) / 86400_000, 27)
        if (failFetch) throw new Error("Google unavailable")
        entered?.()
        if (hold) await hold
        return { rowLimitReached: true, pages: [
          { pageUrl: "https://example.com/a", impressions: 1000, clicks: 10, ctr: 0.01, position: 5 },
          { pageUrl: "https://example.com/b", impressions: 2000, clicks: 20, ctr: 0.01, position: 10 },
          { pageUrl: "https://other.example.com/a", impressions: 90000, clicks: 1000, ctr: 0.01, position: 1 },
        ] }
      },
    } })
    await server.register(aggregationRoutes)
    const inject = (method: "GET" | "POST" | "PATCH", url: string, payload?: object) => server.inject({ method, url, headers, payload })
    const plan = async () => {
      const response = await inject("GET", `${base}/action-plan`)
      assert.equal(response.statusCode, 200, response.body)
      return response.json<ActionPlan>()
    }
    assert.equal((await server.inject({ method: "GET", url: `${base}/action-plan` })).statusCode, 401)
    assert.equal((await plan()).actions[0].affectedPages, 2, "old audits do not inflate the current issue count")
    const legacy = await inject("GET", `/api/optimization?projectId=${project.id}`)
    assert.equal(legacy.json().recommendations[0].failCount, 2)
    for (const [method, path, payload] of [
      ["GET", "action-plan", undefined], ["PATCH", "action-plan/title", { status: "IMPLEMENTED" }],
      ["POST", "action-plan/verify", {}], ["POST", "search-console/sync", { googleAccountId: account.id, propertyUrl: "sc-domain:example.com" }],
      ["GET", `search-console/properties?googleAccountId=${account.id}`, undefined],
    ] as const) assert.equal((await inject(method, `/api/projects/${foreignProject.id}/${path}`, payload)).statusCode, 404)
    assert.equal(providerCalls, 0, "unauthorized projects are rejected before calling Google")
    assert.equal((await inject("POST", `${base}/search-console/sync`, { googleAccountId: foreignAccount.id, propertyUrl: "sc-domain:example.com" })).statusCode, 400)
    assert.equal(providerCalls, 0, "cross-tenant Google accounts are rejected before using credentials")
    const properties = await inject("GET", `${base}/search-console/properties?googleAccountId=${account.id}`)
    assert.equal(properties.json().properties[0].siteUrl, "sc-domain:example.com")
    const syncBody = { googleAccountId: account.id, propertyUrl: "sc-domain:example.com" }
    const synced = await inject("POST", `${base}/search-console/sync`, syncBody)
    assert.equal(synced.statusCode, 200, synced.body)
    assert.equal(synced.json().pageCount, 2, "other subdomains are excluded")
    const enriched = await plan()
    assert.equal(enriched.actions[0].search?.impressions, 3000)
    assert.equal(enriched.actions[0].confidence, "GSC_MATCHED")
    assert.equal(enriched.searchConsole?.rowLimitReached, true)
    const snapshotsBefore = await prisma.searchConsoleSnapshot.count({ where: { tenantId: own.id, projectId: project.id } })
    failFetch = true
    assert.equal((await inject("POST", `${base}/search-console/sync`, syncBody)).statusCode, 502)
    assert.equal(await prisma.searchConsoleSnapshot.count({ where: { tenantId: own.id, projectId: project.id } }), snapshotsBefore)
    assert.equal((await plan()).actions[0].search?.impressions, 3000, "a failed import retains usable data")
    failFetch = false
    hold = new Promise(resolve => { unblock = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    const firstImport = inject("POST", `${base}/search-console/sync`, syncBody)
    await started
    assert.equal((await inject("POST", `${base}/search-console/sync`, syncBody)).statusCode, 409, "concurrent imports cannot share a lease")
    unblock!()
    assert.equal((await firstImport).statusCode, 200)
    hold = undefined
    entered = undefined
    assert.equal((await inject("PATCH", `${base}/action-plan/title`, { status: "VERIFIED" })).statusCode, 400, "verified is evidence-only")
    await prisma.user.update({ where: { id: user.id }, data: { role: "GUEST" } })
    assert.equal((await inject("PATCH", `${base}/action-plan/title`, { status: "IMPLEMENTED" })).statusCode, 403)
    assert.equal((await inject("GET", `${base}/action-plan`)).statusCode, 200)
    await prisma.user.update({ where: { id: user.id }, data: { role: "MEMBER" } })
    assert.equal((await inject("PATCH", `${base}/action-plan/title`, { status: "IMPLEMENTED", note: "Titres corrigés" })).statusCode, 200)
    const saved = await prisma.seoAction.findFirstOrThrow({ where: { projectId: project.id, tenantId: own.id, checkName: "title" } })
    assert.equal(saved.expectedPageUrls.length, 2)
    assert.equal((await plan()).actions[0].note, "Titres corrigés", "state survives a fresh API request")
    assert.equal((await inject("PATCH", `${base}/action-plan/title`, { status: "IMPLEMENTED", note: "Note actualisée" })).statusCode, 200)
    assert.equal((await prisma.seoAction.findUniqueOrThrow({ where: { id: saved.id } })).implementedAt!.getTime(), saved.implementedAt!.getTime(), "editing notes does not move the verification baseline")
    assert.equal((await inject("POST", `${base}/action-plan/verify`, {})).json().verified.length, 0)
    const recrawl = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: project.domain, status: "COMPLETED", createdAt: new Date(), completedAt: new Date() } })
    await createPage(recrawl.id, "https://example.com/a", "PASS")
    const partial = await inject("POST", `${base}/action-plan/verify`, {})
    assert.equal(partial.json().verified.length, 0, "a partial crawl is not proof of correction")
    assert.match(partial.json().pending[0].reason, /pas été contrôlées/)
    await createPage(recrawl.id, "https://example.com/b", "PASS")
    assert.deepEqual((await inject("POST", `${base}/action-plan/verify`, {})).json().verified, ["title"])
    assert.equal((await plan()).actions[0].status, "VERIFIED")
    assert.equal((await plan()).actions[0].verifiedAuditId, recrawl.id)
    const regression = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: project.domain, status: "COMPLETED", createdAt: new Date(), completedAt: new Date() } })
    await createPage(regression.id, "https://example.com/a", "FAIL")
    assert.match((await plan()).actions[0].reason, /Régression/)
    assert.deepEqual((await inject("POST", `${base}/action-plan/verify`, {})).json().reopened, ["title"])
    assert.equal((await plan()).actions[0].status, "OPEN")
    const snapshot = await prisma.searchConsoleSnapshot.findFirstOrThrow({ where: { tenantId: own.id, projectId: project.id } })
    await assert.rejects(prisma.searchConsoleSnapshot.create({ data: { tenantId: other.id, projectId: project.id, googleAccountId: foreignAccount.id, propertyUrl: "sc-domain:example.com", startDate: "2026-09-01", endDate: "2026-09-28" } }))
    await assert.rejects(prisma.searchConsolePageMetric.create({ data: { tenantId: other.id, snapshotId: snapshot.id, pageUrl: "https://example.com/x", impressions: 1, clicks: 0, ctr: 0, position: 1 } }))
    await assert.rejects(prisma.seoAction.create({ data: { tenantId: other.id, projectId: project.id, checkName: "h1", expectedPageUrls: [] } }))
    await prisma.searchConsoleSnapshot.createMany({ data: Array.from({ length: 13 }, (_, index) => ({ tenantId: own.id, projectId: project.id, googleAccountId: account.id, propertyUrl: "sc-domain:example.com", startDate: "2026-09-01", endDate: "2026-09-28", importedAt: new Date(Date.now() - (index + 1) * 86400_000) })) })
    assert.equal((await inject("POST", `${base}/search-console/sync`, syncBody)).statusCode, 200)
    assert.equal(await prisma.searchConsoleSnapshot.count({ where: { tenantId: own.id, projectId: project.id } }), 12, "retention bounds storage")
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } })
    assert.equal((await inject("GET", `${base}/action-plan`)).statusCode, 404)
  } finally {
    unblock?.()
    await server.close()
    await prisma.tenant.deleteMany({ where: { id: { in: [own.id, other.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, foreignUser.id] } } })
    await prisma.$disconnect()
  }
})
