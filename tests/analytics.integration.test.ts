import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { searchComparisonWindows } from "../packages/shared/src/searchInsights"
import type { AnalyticsProperty, AnalyticsQuality, ProjectAnalytics } from "../packages/shared/src/types/analytics.types"

test("GA4: tenant boundaries, atomic imports, measured outcomes and source lifecycle", { skip: !process.env.TEST_DATABASE_URL, timeout: 120_000 }, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!)
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = url.href; process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID(); process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  const { prisma } = await import("../apps/api/src/lib/prisma")
  const { default: Fastify } = await import("fastify")
  const { default: cookie } = await import("@fastify/cookie")
  const { default: authPlugin } = await import("../apps/api/src/plugins/auth")
  const { default: routes } = await import("../apps/api/src/routes/analytics")
  const suffix = randomUUID()
  const own = await prisma.tenant.create({ data: { name: "Analytics test", slug: `ga4-${suffix}` } })
  const foreign = await prisma.tenant.create({ data: { name: "Foreign analytics", slug: `foreign-ga4-${suffix}` } })
  const user = await prisma.user.create({ data: { tenantId: own.id, name: "Test", email: `ga4-${suffix}@example.com`, role: "MEMBER" } })
  const foreignUser = await prisma.user.create({ data: { tenantId: foreign.id, name: "Other", email: `foreign-ga4-${suffix}@example.com`, role: "MEMBER" } })
  const session = await prisma.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } })
  const project = await prisma.project.create({ data: { tenantId: own.id, userId: user.id, name: "Shop", domain: "https://example.com/" } })
  const otherProject = await prisma.project.create({ data: { tenantId: foreign.id, userId: foreignUser.id, name: "Other", domain: "https://example.com/" } })
  const account = await prisma.googleAccount.create({ data: { tenantId: own.id, googleId: `ga4-${suffix}`, googleEmail: user.email, accessToken: "fixture", refreshToken: "fixture", tokenExpiry: new Date(Date.now() + 3600000), scopes: ["https://www.googleapis.com/auth/analytics.readonly"] } })
  const otherAccount = await prisma.googleAccount.create({ data: { tenantId: foreign.id, googleId: `other-ga4-${suffix}`, googleEmail: foreignUser.email, accessToken: "fixture", refreshToken: "fixture", tokenExpiry: new Date(Date.now() + 3600000), scopes: account.scopes } })
  const quality: AnalyticsQuality = { rowLimitReached: false, thresholded: false, sampled: false, otherRowLoss: false, truncated: false, revenueRestricted: false, metadataUnavailable: false, omittedRows: 0, emptyReason: null }
  let property: AnalyticsProperty = { propertyId: "properties/123", displayName: "Shop Analytics", timeZone: "Europe/Paris", currencyCode: "EUR", streams: [{ id: "456", displayName: "Shop", defaultUri: project.domain }, { id: "999", displayName: "Other", defaultUri: "https://other.example.com/" }] }
  let calls = 0; let fail = false; let comparisonStart = ""; let hold: Promise<void> | undefined; let unblock: (() => void) | undefined; let entered: (() => void) | undefined
  const server = Fastify()
  const base = `/api/projects/${project.id}/analytics`
  const body = { googleAccountId: account.id, propertyId: property.propertyId, streamId: "456" }
  const inject = (method: "GET" | "POST", path: string, payload?: object) => server.inject({ method, url: path, headers: { authorization: `Bearer ${session.token}` }, payload })
  try {
    await server.register(cookie); await server.register(authPlugin)
    await server.register(routes, { provider: {
      async getProperty(tenantId, accountId, propertyId) { calls++; assert.equal(tenantId, own.id); assert.equal(accountId, account.id); assert.equal(propertyId, "properties/123"); return property },
      async fetchPages(_tenant, _account, source, stream, domain, start, end) {
        calls++; assert.equal(source.currencyCode, "EUR"); assert.equal(stream, "456"); assert.equal(domain, project.domain)
        assert.ok([6, 27].includes((Date.parse(end) - Date.parse(start)) / 86400_000))
        if (fail) throw new Error("Google unavailable")
        entered?.(); if (hold) await hold
        if (comparisonStart) return { quality, pages: start === comparisonStart
          ? [{ pageUrl: "https://example.com/a", sessions: 100, keyEvents: 10, purchaseRevenue: 500 }, { pageUrl: "https://example.com/b", sessions: 1000, keyEvents: 100, purchaseRevenue: 9000 }]
          : [{ pageUrl: "https://example.com/a", sessions: 150, keyEvents: 15, purchaseRevenue: 800 }] }
        return { quality, pages: [{ pageUrl: "https://example.com/a", sessions: 200, keyEvents: 20, purchaseRevenue: 600 }, { pageUrl: "https://example.com/b", sessions: 100, keyEvents: 5, purchaseRevenue: -50 }, { pageUrl: "https://other.example.com/a", sessions: 999, keyEvents: 99, purchaseRevenue: 9999 }] }
      },
    } })
    assert.equal((await server.inject({ method: "GET", url: base })).statusCode, 401)
    for (const [method, path, payload] of [["GET", "", undefined], ["GET", `/property?${new URLSearchParams(body)}`, undefined], ["POST", "/sync", body], ["POST", "/actions/title/measure", { windowDays: 7 }]] as const) {
      assert.equal((await inject(method, `/api/projects/${otherProject.id}/analytics${path}`, payload)).statusCode, 404)
    }
    assert.equal(calls, 0)
    assert.equal((await inject("POST", `${base}/sync`, { ...body, googleAccountId: otherAccount.id })).statusCode, 400)
    assert.equal(calls, 0)
    assert.equal((await inject("GET", `${base}/property?googleAccountId=${account.id}&propertyId=https://evil.test`)).statusCode, 400)
    const checked = await inject("GET", `${base}/property?googleAccountId=${account.id}&propertyId=properties/123`)
    assert.equal(checked.json().streams.length, 1)
    assert.equal((await inject("POST", `${base}/sync`, { ...body, streamId: "999" })).statusCode, 400)
    assert.equal((await inject("POST", `${base}/sync`, body)).statusCode, 200)
    let overview = (await inject("GET", base)).json<ProjectAnalytics>()
    assert.equal(overview.summary!.sessions, 300)
    assert.equal(overview.summary!.purchaseRevenue, 550)
    assert.equal(overview.total, 2)
    fail = true; assert.equal((await inject("POST", `${base}/sync`, body)).statusCode, 502)
    assert.equal((await inject("GET", base)).json().snapshot.id, overview.snapshot!.id); fail = false
    hold = new Promise(resolve => { unblock = resolve }); const importing = new Promise<void>(resolve => { entered = resolve })
    const pending = inject("POST", `${base}/sync`, body); await importing
    assert.equal((await inject("POST", `${base}/sync`, body)).statusCode, 409); unblock!(); assert.equal((await pending).statusCode, 200); hold = undefined
    const audit = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: project.domain, status: "COMPLETED", completedAt: new Date() } })
    await prisma.auditPage.create({ data: { tenantId: own.id, auditId: audit.id, url: "https://example.com/a?offer=red", h1: [], schemaTypes: [], results: { create: { checkName: "title", category: "ON_PAGE", status: "FAIL", score: 0, priority: "HIGH", effort: "LOW", message: "Absent" } } } })
    overview = (await inject("GET", base)).json<ProjectAnalytics>()
    assert.equal(overview.actions[0].exposure!.keyEvents, 20)
    const action = await prisma.seoAction.create({ data: { tenantId: own.id, projectId: project.id, checkName: "title", status: "IMPLEMENTED", implementedAt: new Date(), expectedPageUrls: ["https://example.com/a?offer=red", "https://example.com/a?offer=blue", "https://example.com/b"] } })
    const measurePath = `${base}/actions/title/measure`
    const previousCalls = calls
    assert.equal((await inject("POST", measurePath, { windowDays: 7 })).statusCode, 409); assert.equal(calls, previousCalls)
    await prisma.user.update({ where: { id: user.id }, data: { role: "GUEST" } })
    assert.equal((await inject("GET", base)).statusCode, 200)
    assert.equal((await inject("POST", measurePath, { windowDays: 7 })).statusCode, 403)
    assert.equal((await inject("POST", `${base}/sync`, body)).statusCode, 403)
    await prisma.user.update({ where: { id: user.id }, data: { role: "MEMBER" } })
    const implementedAt = new Date(Date.now() - 40 * 86400_000)
    await prisma.seoAction.update({ where: { id: action.id }, data: { implementedAt } })
    const windows = searchComparisonWindows(implementedAt, 7, new Date(), "Europe/Paris"); comparisonStart = windows.beforeStartDate
    const measured = await inject("POST", measurePath, { windowDays: 7 })
    assert.equal(measured.statusCode, 200, measured.body)
    assert.equal(measured.json().expectedPages, 2); assert.equal(measured.json().comparablePages, 1); assert.equal(measured.json().missingAfterPages, 1)
    assert.equal(measured.json().before.sessions, 100); assert.equal(measured.json().changes.purchaseRevenue, 300)
    assert.equal((await inject("GET", base)).json().actions[0].measurement.id, measured.json().id)
    fail = true; assert.equal((await inject("POST", measurePath, { windowDays: 7 })).statusCode, 502); fail = false
    assert.equal((await inject("GET", base)).json().actions[0].measurement.id, measured.json().id)
    property = { ...property, currencyCode: "USD" }; assert.equal((await inject("POST", measurePath, { windowDays: 7 })).statusCode, 409); property = { ...property, currencyCode: "EUR" }
    await inject("POST", measurePath, { windowDays: 7 }); assert.equal(await prisma.analyticsActionMeasurement.count({ where: { tenantId: own.id } }), 1)
    hold = new Promise(resolve => { unblock = resolve }); const measuring = new Promise<void>(resolve => { entered = resolve })
    const inFlight = inject("POST", measurePath, { windowDays: 7 }); await measuring
    assert.equal((await inject("POST", `${base}/sync`, body)).statusCode, 409)
    await prisma.seoAction.update({ where: { id: action.id }, data: { implementedAt: new Date(implementedAt.getTime() + 1000) } }); unblock!()
    assert.equal((await inFlight).statusCode, 502); hold = undefined
    assert.equal((await inject("GET", base)).json().actions[0].measurement, null)
    const snapshot = await prisma.analyticsSnapshot.findFirstOrThrow({ where: { projectId: project.id, tenantId: own.id } })
    const snapshotData = { projectId: project.id, propertyId: "properties/123", displayName: "Shop", streamId: "456", timeZone: "Europe/Paris", currencyCode: "EUR", startDate: "2026-09-01", endDate: "2026-09-28", quality: { ...quality } }
    await assert.rejects(prisma.analyticsSnapshot.create({ data: { ...snapshotData, tenantId: foreign.id, googleAccountId: otherAccount.id } }), { code: "P2003" })
    await assert.rejects(prisma.analyticsSnapshot.create({ data: { ...snapshotData, tenantId: own.id, googleAccountId: otherAccount.id } }), { code: "P2003" })
    await assert.rejects(prisma.analyticsPageMetric.create({ data: { tenantId: foreign.id, snapshotId: snapshot.id, pageUrl: project.domain, sessions: 1, keyEvents: 1, purchaseRevenue: 1 } }), { code: "P2003" })
    const measurementData = { actionId: action.id, propertyId: "properties/123", streamId: "456", timeZone: "Europe/Paris", currencyCode: "EUR", implementedAt, windowDays: 28,
      beforeStartDate: windows.beforeStartDate, beforeEndDate: windows.beforeEndDate, afterStartDate: windows.afterStartDate, afterEndDate: windows.afterEndDate, quality: { ...quality }, result: {} }
    await assert.rejects(prisma.analyticsActionMeasurement.create({ data: { ...measurementData, tenantId: foreign.id, googleAccountId: otherAccount.id } }), { code: "P2003" })
    await assert.rejects(prisma.analyticsActionMeasurement.create({ data: { ...measurementData, tenantId: own.id, googleAccountId: otherAccount.id } }), { code: "P2003" })
    comparisonStart = ""
    await prisma.analyticsSnapshot.createMany({ data: Array.from({ length: 13 }, (_, index) => ({ ...snapshotData, tenantId: own.id, googleAccountId: account.id, importedAt: new Date(Date.now() - (index + 1) * 86400_000) })) })
    assert.equal((await inject("POST", `${base}/sync`, body)).statusCode, 200)
    assert.equal(await prisma.analyticsSnapshot.count({ where: { projectId: project.id, tenantId: own.id } }), 12)
    await prisma.googleAccount.deleteMany({ where: { id: account.id, tenantId: own.id } })
    assert.equal(await prisma.analyticsPageMetric.count({ where: { tenantId: own.id } }), 0)
    assert.equal(await prisma.analyticsActionMeasurement.count({ where: { tenantId: own.id } }), 0)
    assert.equal((await inject("GET", base)).json().snapshot, null)
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } }); assert.equal((await inject("GET", base)).statusCode, 404)
  } finally {
    unblock?.(); await server.close()
    await prisma.tenant.deleteMany({ where: { id: { in: [own.id, foreign.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, foreignUser.id] } } }); await prisma.$disconnect()
  }
})
