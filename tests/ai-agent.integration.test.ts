import { test, mock } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

test("Managed AI: audit context, strict input, role/owner checks, token accounting, atomic quotas and uncertain cost reservations", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = url.href; process.env.OPENAI_API_KEY = "private-fixture-key"; process.env.OPENAI_SEO_MODEL = "fixture"
  process.env.OPENAI_SEO_INPUT_USD_PER_MILLION = "1"; process.env.OPENAI_SEO_OUTPUT_USD_PER_MILLION = "2"
  const { prisma } = await import("../apps/api/src/lib/prisma"), { default: Fastify } = await import("fastify"), { default: cookie } = await import("@fastify/cookie")
  const { default: auth } = await import("../apps/api/src/plugins/auth"), { default: routes } = await import("../apps/api/src/routes/ai-agent"), { default: visibility } = await import("../apps/api/src/routes/ai-visibility")
  const { executeAiRequest, aiUsage } = await import("../apps/api/src/lib/aiBudget")
  const prior = await prisma.planConfig.findUnique({ where: { plan: "AGENCY" } })
  await prisma.planConfig.upsert({ where: { plan: "AGENCY" }, create: { plan: "AGENCY", displayName: "AI fixture", price: 0, auditQuota: 1, pageQuota: 1, projectQuota: 1, userQuota: 1, featureAI: true, aiMonthlyQuota: 10, aiMonthlyBudgetCents: 100 }, update: { isActive: true, featureAI: true, aiMonthlyQuota: 10, aiMonthlyBudgetCents: 100 } })
  const tenant = await prisma.tenant.create({ data: { name: "AI", slug: randomUUID(), plan: "AGENCY" } })
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: "Editor", email: randomUUID() + "@example.com", role: "MEMBER" } })
  const peer = await prisma.user.create({ data: { tenantId: tenant.id, name: "Peer", email: randomUUID() + "@example.com", role: "MEMBER" } })
  const project = await prisma.project.create({ data: { tenantId: tenant.id, userId: user.id, name: "Client", domain: "https://example.com/" } })
  const other = await prisma.project.create({ data: { tenantId: tenant.id, userId: peer.id, name: "Secret peer", domain: "https://other-example.com/" } })
  const session = await prisma.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } })
  const server = Fastify(), actor = { userId: user.id, tenantId: tenant.id, projectId: project.id }, headers = { authorization: "Bearer " + session.token, "content-type": "application/json" }
  let calls = 0, fail = false
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses")
    const body = JSON.parse(init.body as string) as { input: string; store: boolean; max_output_tokens: number; text: { format: { strict: boolean } } }
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 1500); assert.equal(body.text.format.strict, true)
    if (!body.input.includes("question")) assert.ok(body.input.includes("example.com"))
    else assert.ok(!body.input.includes("example.com"), "Visibility prompts never include the domain to be detected")
    assert.ok(!body.input.includes("other-example")); assert.ok(!body.input.includes("private-fixture-key"))
    if (fail) throw new Error("timeout private-fixture-key")
    return new Response(JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 50 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ reply: "Corrigez les erreurs relevées dans votre audit." }) }] }] }))
  })
  try {
    await server.register(cookie); await server.register(auth); await server.register(routes); await server.register(visibility)
    const endpoint = "/api/projects/" + project.id + "/ai-agent", body = { messages: [{ role: "user", content: "Quelles corrections ?" }] }
    const post = (payload: unknown = body) => server.inject({ method: "POST", url: endpoint, headers, payload: JSON.stringify(payload) })
    assert.equal((await post()).statusCode, 409); assert.equal(calls, 0)
    const audit = await prisma.audit.create({ data: { tenantId: tenant.id, projectId: project.id, userId: user.id, url: project.domain, status: "COMPLETED", completedAt: new Date() } })
    const answer = await post(); assert.equal(answer.statusCode, 200, answer.body); assert.equal(answer.json<{ auditId: string }>().auditId, audit.id)
    assert.equal((await aiUsage(tenant.id)).measuredUsd, 0.0002)
    assert.equal((await post({ ...body, tenantId: tenant.id })).statusCode, 400)
    assert.equal((await server.inject({ method: "POST", url: "/api/projects/" + other.id + "/ai-agent", headers, payload: body })).statusCode, 404)
    await prisma.user.update({ where: { id: user.id }, data: { role: "GUEST" } }); assert.equal((await post()).statusCode, 403)
    await prisma.user.update({ where: { id: user.id }, data: { role: "MEMBER" } })
    fail = true; const timeout = await post(); assert.equal(timeout.statusCode, 502); assert.ok(!timeout.body.includes("private-fixture-key"))
    const usage = await aiUsage(tenant.id); assert.equal(usage.uncertainRequests, 1); assert.ok(usage.committedUsd > usage.measuredUsd)
    const measure = () => server.inject({ method: "POST", url: "/api/ai-visibility/check", headers, payload: { projectId: project.id, domain: "example.com", queries: ["Quels outils SEO recommandez-vous ?"], engine: "openai" } })
    assert.equal((await measure()).statusCode, 502)
    assert.equal(await prisma.aIVisibilityCheck.count({ where: { tenantId: tenant.id } }), 0, "Provider failures never become an absent mention")
    fail = false; assert.equal((await measure()).statusCode, 200)
    const measured = await prisma.aIVisibilityCheck.findFirstOrThrow({ where: { tenantId: tenant.id } }); assert.equal(measured.mentioned, false); assert.equal(measured.engine, "openai:fixture")
    await prisma.aIVisibilityCheck.create({ data: { tenantId: tenant.id, query: "Legacy failed query", domain: "example.com", engine: "claude", mentioned: false } })
    const visible = await server.inject({ method: "GET", url: "/api/ai-visibility", headers }); assert.equal(visible.json<{ stats: { total: number } }>().stats.total, 1, "Unverifiable legacy rows are excluded from statistics")
    const currentUsage = await aiUsage(tenant.id)
    await prisma.planConfig.update({ where: { plan: "AGENCY" }, data: { aiMonthlyQuota: currentUsage.used + 1 } })
    const race = await Promise.allSettled([executeAiRequest(actor, "CHAT", async record => { await record({ input_tokens: 10, output_tokens: 10 }); return "A" }), executeAiRequest(actor, "CHAT", async record => { await record({ input_tokens: 10, output_tokens: 10 }); return "B" })])
    assert.equal(race.filter(result => result.status === "fulfilled").length, 1)
    await prisma.planConfig.update({ where: { plan: "AGENCY" }, data: { aiMonthlyQuota: 10, aiMonthlyBudgetCents: 1 } })
    await assert.rejects(executeAiRequest(actor, "CHAT", async () => "never"), /budget/)
    await prisma.tenant.update({ where: { id: tenant.id }, data: { isSuspended: true } })
    await assert.rejects(executeAiRequest(actor, "CHAT", async () => "never"), /refusé/)
  } finally {
    mock.restoreAll(); await server.close(); await prisma.tenant.deleteMany({ where: { id: tenant.id } }); await prisma.user.deleteMany({ where: { id: { in: [user.id, peer.id] } } })
    if (prior) await prisma.planConfig.update({ where: { plan: "AGENCY" }, data: { isActive: prior.isActive, featureAI: prior.featureAI, aiMonthlyQuota: prior.aiMonthlyQuota, aiMonthlyBudgetCents: prior.aiMonthlyBudgetCents } })
    else await prisma.planConfig.deleteMany({ where: { plan: "AGENCY" } })
    await prisma.$disconnect()
  }
})
