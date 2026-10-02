import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID, createHmac } from "node:crypto"
import { assertAuditCapacity } from "../packages/shared/src/utils/auditQuota"

const databaseUrl = process.env.TEST_DATABASE_URL

test("registration, authorization and database tenant boundaries", { skip: !databaseUrl }, async () => {
  // Refuse to run against any database other than the explicitly named test database.
  const target = new URL(databaseUrl!)
  assert.equal(target.hostname, "127.0.0.1")
  assert.equal(target.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = databaseUrl
  process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID()
  process.env.BETTER_AUTH_URL = "http://localhost:3000"
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  delete process.env.RESEND_API_KEY
  const { auth } = await import("../site/lib/auth")
  const { prisma } = await import("../site/lib/prisma")
  const { prisma: apiPrisma } = await import("../apps/api/src/lib/prisma")
  const { default: Fastify } = await import("fastify")
  const { default: cookie } = await import("@fastify/cookie")
  const { default: authPlugin } = await import("../apps/api/src/plugins/auth")
  const { requireSuperAdmin } = await import("../apps/api/src/lib/guards")
  const suffix = randomUUID()
  const victimTenant = await prisma.tenant.create({ data: { name: "Victim test", slug: `victim-${suffix}` } })
  const server = Fastify()
  try {
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", "X-Real-IP": "127.0.0.1" },
      body: JSON.stringify({ name: "Security test", email: `security-${suffix}@example.com`, password: "Test-password-123456!", role: "ADMIN", isSuperAdmin: true, tenantId: victimTenant.id }),
    }))
    assert.equal(response.status, 200, await response.clone().text())
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `security-${suffix}@example.com` } })
    assert.equal(user.isSuperAdmin, false)
    assert.equal(user.role, "GUEST")
    assert.ok(user.tenantId)
    assert.notEqual(user.tenantId, victimTenant.id)
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } })
    await server.register(cookie)
    await server.register(authPlugin)
    server.get("/api/private", (request) => ({ tenantId: request.tenantId }))
    server.post("/api/private", () => ({ ok: true }))
    server.get("/api/admin/test", { preHandler: requireSuperAdmin() }, () => ({ ok: true }))
    const bearer = { authorization: `Bearer ${session.token}` }
    assert.equal((await server.inject({ method: "GET", url: "/api/private" })).statusCode, 401)
    assert.equal((await server.inject({ method: "GET", url: "/api/private", headers: bearer })).json().tenantId, user.tenantId)
    assert.equal((await server.inject({ method: "GET", url: "/api/admin/test", headers: bearer })).statusCode, 403)
    const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(session.token).digest("base64")
    const cookieHeader = { cookie: `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}` }
    assert.equal((await server.inject({ method: "GET", url: "/api/private", headers: cookieHeader })).statusCode, 200)
    assert.equal((await server.inject({ method: "GET", url: "/api/private", headers: { cookie: `better-auth.session_token=${session.token}.invalid` } })).statusCode, 401)
    assert.equal((await server.inject({ method: "POST", url: "/api/private", headers: { cookie: `better-auth.session_token=${session.token}.invalid`, origin: "https://evil.example" } })).statusCode, 403)
    await prisma.user.update({ where: { id: user.id }, data: { isBanned: true } })
    assert.equal((await server.inject({ method: "GET", url: "/api/private", headers: bearer })).statusCode, 401)
    const project = await prisma.project.create({ data: { tenantId: user.tenantId!, userId: user.id, name: "Test", domain: "https://example.com" } })
    const audit = await prisma.audit.create({ data: { tenantId: user.tenantId!, userId: user.id, projectId: project.id, url: "https://example.com" } })
    await assert.rejects(prisma.auditPage.create({ data: { tenantId: victimTenant.id, auditId: audit.id, url: "https://example.com", h1: [], schemaTypes: [] } }))
    const page = await prisma.auditPage.create({ data: { tenantId: user.tenantId!, auditId: audit.id, url: "https://example.com", h1: [], schemaTypes: [] } })
    await assert.rejects(prisma.pageResult.create({ data: { tenantId: victimTenant.id, pageId: page.id, category: "TECHNICAL", checkName: "test", status: "PASS", score: 100, message: "test", priority: "LOW", effort: "LOW" } }))
    const listing1 = await prisma.gBPListing.create({ data: { tenantId: user.tenantId!, businessName: "First", category: "Test", address: "Test" } })
    const listing2 = await prisma.gBPListing.create({ data: { tenantId: victimTenant.id, businessName: "Second", category: "Test", address: "Test" } })
    const externalId = `google-review-${suffix}`
    await prisma.gBPReview.create({ data: { tenantId: user.tenantId!, listingId: listing1.id, googleReviewId: externalId, authorName: "Test", rating: 5 } })
    await prisma.gBPReview.create({ data: { tenantId: victimTenant.id, listingId: listing2.id, googleReviewId: externalId, authorName: "Test", rating: 5 } })
    await assert.rejects(prisma.gBPReview.create({ data: { tenantId: victimTenant.id, listingId: listing1.id, authorName: "Test", rating: 5 } }))
    await prisma.audit.update({ where: { id: audit.id }, data: { options: { maxPages: 10 } } })
    const launches = await Promise.allSettled([1, 2].map(() => prisma.$transaction(async tx => {
      await assertAuditCapacity(tx, user.tenantId!, 60)
      return tx.audit.create({ data: { tenantId: user.tenantId!, userId: user.id, projectId: project.id, url: "https://example.com", options: { maxPages: 60 } } })
    })))
    assert.equal(launches.filter(result => result.status === "fulfilled").length, 1, "parallel launches reserve the page budget")
    await prisma.audit.updateMany({ where: { tenantId: user.tenantId! }, data: { deletedAt: new Date() } })
    await assert.rejects(prisma.$transaction(tx => assertAuditCapacity(tx, user.tenantId!, 60)), /Quota pages/)
  } finally {
    await server.close()
    await prisma.$disconnect()
    await apiPrisma.$disconnect()
  }
})
