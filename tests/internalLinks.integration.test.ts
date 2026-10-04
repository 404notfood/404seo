import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import type { ProjectInternalLinks } from "../packages/shared/src/types/internalLinks.types"

test("internal linking: owner/tenant isolation, latest completed audit, pagination and evidence after recrawl", { skip: !process.env.TEST_DATABASE_URL, timeout: 60_000 }, async () => {
  const database = new URL(process.env.TEST_DATABASE_URL!)
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = database.href; process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID(); process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  const { prisma } = await import("../apps/api/src/lib/prisma")
  const { default: Fastify } = await import("fastify"), { default: cookie } = await import("@fastify/cookie")
  const { default: authPlugin } = await import("../apps/api/src/plugins/auth"), { default: routes } = await import("../apps/api/src/routes/internal-links")
  const suffix = randomUUID()
  const own = await prisma.tenant.create({ data: { name: "Link test", slug: `link-${suffix}` } })
  const foreign = await prisma.tenant.create({ data: { name: "Other link test", slug: `other-link-${suffix}` } })
  const user = await prisma.user.create({ data: { tenantId: own.id, name: "Link tester", email: `link-${suffix}@example.com`, role: "MEMBER" } })
  const colleague = await prisma.user.create({ data: { tenantId: own.id, name: "Colleague", email: `colleague-link-${suffix}@example.com` } })
  const stranger = await prisma.user.create({ data: { tenantId: foreign.id, name: "Stranger", email: `other-link-${suffix}@example.com` } })
  const session = await prisma.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } })
  const project = await prisma.project.create({ data: { tenantId: own.id, userId: user.id, name: "Shop", domain: "https://example.com/" } })
  const otherProject = await prisma.project.create({ data: { tenantId: foreign.id, userId: stranger.id, name: "Other shop", domain: project.domain } })
  const colleagueProject = await prisma.project.create({ data: { tenantId: own.id, userId: colleague.id, name: "Colleague shop", domain: project.domain } })
  const server = Fastify(); const headers = { authorization: `Bearer ${session.token}` }
  try {
    await server.register(cookie); await server.register(authPlugin); await server.register(routes)
    const endpoint = `/api/projects/${project.id}/internal-links`
    assert.equal((await server.inject({ url: endpoint })).statusCode, 401)
    for (const other of [otherProject.id, colleagueProject.id]) assert.equal((await server.inject({ url: `/api/projects/${other}/internal-links`, headers })).statusCode, 404)
    assert.equal((await server.inject({ url: `${endpoint}?page=-1`, headers })).statusCode, 400)
    assert.equal((await server.inject({ url: `${endpoint}?view=unknown`, headers })).statusCode, 400)
    const get = async (query = "") => (await server.inject({ url: endpoint + query, headers })).json<ProjectInternalLinks>()
    assert.equal((await get()).audit, null)
    const audit = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: "https://example.com/guide", status: "COMPLETED", completedAt: new Date(Date.now() - 60000) } })
    const linkingData = { version: 1, links: [], blocks: [{ text: "Nos chaussures rouges accompagnent les promenades de votre quotidien.", linkedTexts: [] }], linksTruncated: false, blocksTruncated: false }
    await prisma.auditPage.createMany({ data: [
      { tenantId: own.id, auditId: audit.id, url: "https://example.com/guide", title: "Conseils pratiques", h1: [], schemaTypes: [], statusCode: 200, isIndexable: true, linkingData },
      { tenantId: own.id, auditId: audit.id, url: "https://example.com/shop", title: "Chaussures rouges", h1: [], schemaTypes: [], statusCode: 200, isIndexable: true },
      ...Array.from({ length: 27 }, (_, index) => ({ tenantId: own.id, auditId: audit.id, url: `https://example.com/other-${index}`, title: "Autre sujet", h1: [], schemaTypes: [], statusCode: 200, isIndexable: true })),
    ] })
    let data = await get(); assert.equal(data.audit!.id, audit.id); assert.equal(data.suggestions[0].anchor, "chaussures rouges")
    assert.equal(data.summary.contextualPages, 1)
    data = await get("?view=pages&page=2"); assert.equal(data.nodes.length, 4); assert.equal(data.pageCount, 2)
    assert.equal((await get("?view=pages&q=shop&unlinked=true")).nodes.length, 1)
    await prisma.user.update({ where: { id: user.id }, data: { role: "GUEST" } }); assert.equal((await server.inject({ url: endpoint, headers })).statusCode, 200)
    const running = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: audit.url, status: "CRAWLING" } })
    assert.equal((await get()).audit!.id, audit.id)
    await prisma.auditPage.createMany({ data: [
      { tenantId: own.id, auditId: running.id, url: audit.url, h1: [], schemaTypes: [], statusCode: 200, isIndexable: true, internalLinks: 1, internalLinkUrls: ["https://example.com/shop"],
        linkingData: { ...linkingData, links: [{ url: "https://example.com/shop", text: "chaussures rouges", nofollow: false, placement: "CONTENT" }], blocks: [{ ...linkingData.blocks[0], linkedTexts: ["chaussures rouges"] }] } },
      { tenantId: own.id, auditId: running.id, url: "https://example.com/shop", title: "Chaussures rouges", h1: [], schemaTypes: [], statusCode: 200, isIndexable: true },
    ] })
    await prisma.audit.update({ where: { id: running.id }, data: { status: "COMPLETED", completedAt: new Date() } })
    data = await get(); assert.equal(data.audit!.id, running.id); assert.equal(data.suggestions.length, 0); assert.equal(data.summary.edges, 1)
    assert.equal((await get("?view=pages&q=shop")).nodes[0].incoming, 1)
    await prisma.audit.update({ where: { id: running.id }, data: { deletedAt: new Date() } }); assert.equal((await get()).audit!.id, audit.id)
    await assert.rejects(prisma.auditPage.create({ data: { tenantId: foreign.id, auditId: audit.id, url: audit.url, h1: [], schemaTypes: [] } }), { code: "P2003" })
    const large = await prisma.audit.create({ data: { tenantId: own.id, userId: user.id, projectId: project.id, url: project.domain, status: "COMPLETED", completedAt: new Date(Date.now() + 1000) } })
    const longUrls = Array.from({ length: 500 }, (_, index) => `https://example.com/unknown?i=${index}&padding=${"a".repeat(1800)}`)
    await prisma.auditPage.createMany({ data: Array.from({ length: 12 }, (_, index) => ({ tenantId: own.id, auditId: large.id, url: `https://example.com/large-${index}`, h1: [], schemaTypes: [], internalLinkUrls: longUrls, internalLinks: 500 })) })
    data = await get(); assert.equal(data.audit!.id, large.id); assert.equal(data.limits.pages, true)
    assert.ok(data.summary.pages < 12 && data.summary.pages > 0, "The byte budget also limits audits below 1,000 pages")
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } })
    assert.equal((await server.inject({ url: endpoint, headers })).statusCode, 404)
  } finally {
    await server.close(); await prisma.tenant.deleteMany({ where: { id: { in: [own.id, foreign.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, colleague.id, stranger.id] } } }); await prisma.$disconnect()
  }
})
