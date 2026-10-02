import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"
import type { CmsFetch, WordPressResource } from "../apps/api/src/lib/cmsWordPress"

test("CMS batches: durable handoff, quota reservation, owner isolation, fresh permissions, cancellation and uncertain publication", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/seo_security_audit")
  process.env.DATABASE_URL = url.href; process.env.CMS_CREDENTIAL_KEY = randomBytes(32).toString("hex"); process.env.OPENAI_API_KEY = "fixture"; process.env.OPENAI_SEO_MODEL = "fixture"
  if (process.env.TEST_REDIS_PORT) { assert.equal(process.env.TEST_REDIS_PORT, "55434"); process.env.REDIS_HOST = "127.0.0.1"; process.env.REDIS_PORT = "55434" }
  const { prisma } = await import("../apps/api/src/lib/prisma"), { default: Fastify } = await import("fastify"), { default: cookie } = await import("@fastify/cookie")
  const { default: auth } = await import("../apps/api/src/plugins/auth"), { default: routes } = await import("../apps/api/src/routes/cms")
  const { processCmsBatch } = await import("../apps/api/src/lib/cmsBatch"), { WordPressClient } = await import("../apps/api/src/lib/cmsWordPress")
  const prior = await prisma.planConfig.findUnique({ where: { plan: "PRO" } })
  await prisma.planConfig.upsert({ where: { plan: "PRO" }, create: { plan: "PRO", displayName: "Batch fixture", price: 0, auditQuota: 1, pageQuota: 1, projectQuota: 1, userQuota: 1, featureAI: true, featureCmsCorrections: true, cmsMonthlyQuota: 30 }, update: { featureAI: true, featureCmsCorrections: true, cmsMonthlyQuota: 30 } })
  const tenant = await prisma.tenant.create({ data: { name: "Batches", slug: randomUUID(), plan: "PRO" } })
  const user = await prisma.user.create({ data: { tenantId: tenant.id, name: "Editor", email: randomUUID() + "@example.com", role: "MEMBER" } })
  const peer = await prisma.user.create({ data: { tenantId: tenant.id, name: "Other", email: randomUUID() + "@example.com", role: "MEMBER" } })
  const session = await prisma.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date(Date.now() + 3600000) } })
  const project = await prisma.project.create({ data: { tenantId: tenant.id, userId: user.id, name: "Client", domain: "https://example.com/" } })
  const other = await prisma.project.create({ data: { tenantId: tenant.id, userId: peer.id, name: "Other client", domain: project.domain } })
  const resources = new Map<number, WordPressResource>([1, 2].map(id => [id, { id, url: "https://example.com/page-" + id, kind: "page", title: "Page " + id, content: "Texte du client", seoTitle: null, seoDescription: null, revision: "a".repeat(64), operationId: "", segments: [{ id: "body:t:1", text: "Les chaussure à 25 €.", type: "CONTENT" }, { id: "body:a:3", text: "Chaussure rouje", type: "ALT" }] }]))
  let writes = 0, generated = 0, tick = 0, uncertain = false
  const fetch: CmsFetch = async (url, options) => {
    const path = new URL(url).pathname, id = Number(path.match(/resources\/(\d+)/)?.[1])
    let data: unknown = path.endsWith("/connection") ? { version: 1, siteUrl: project.domain, label: "Client" } : { ...resources.get(id) }
    if (options?.method === "POST" && !path.endsWith("reconcile")) {
      const body = JSON.parse(options.body!) as { revision: string; operationId: string; seoTitle: string; seoDescription: string; patches?: { id: string; text: string }[] }
      const resource = resources.get(id)!
      assert.equal(body.revision, resource.revision)
      Object.assign(resource, { seoTitle: body.seoTitle, seoDescription: body.seoDescription, operationId: body.operationId, revision: (++tick).toString(16).padStart(64, "0") })
      for (const patch of body.patches ?? []) Object.assign(resource.segments!.find(segment => segment.id === patch.id)!, { text: patch.text })
      writes++; data = { ...resource }
      if (uncertain) { uncertain = false; throw new Error("timeout after write") }
    }
    const body = Buffer.from(JSON.stringify(data)); return { url, status: 200, ok: true, headers: {}, body, text: async () => body.toString() }
  }
  const options = { enqueue: async () => { throw new Error("Redis unavailable") }, clientFactory: (site: string, credentials: { username: string; applicationPassword: string }) => new WordPressClient(site, credentials, fetch),
    generate: async () => ({ seoTitle: "Proposition " + ++generated, seoDescription: "Description du client", reason: "Clarification." }),
    generateText: async (_resource: WordPressResource, mode: "CONTENT" | "ALT") => ({ patches: [{ id: mode === "CONTENT" ? "body:t:1" : "body:a:3", text: mode === "CONTENT" ? "Les chaussures à 25 €." : "Chaussure rouge" }], reason: "Orthographe corrigée." }) }
  const server = Fastify(), headers = { authorization: "Bearer " + session.token, "content-type": "application/json" }, prefix = "/api/projects/" + project.id + "/cms"
  try {
    await server.register(cookie); await server.register(auth); await server.register(routes, options)
    const post = (path: string, payload: unknown) => server.inject({ method: "POST", url: prefix + path, headers, payload: JSON.stringify(payload) })
    assert.equal((await post("/connection", { siteUrl: project.domain, username: "editor", applicationPassword: "a".repeat(24) })).statusCode, 200)
    const input = { action: "GENERATE", mode: "SEO", resources: [{ id: 1, kind: "page" }, { id: 2, kind: "page" }] }
    const created = await post("/batches", input); assert.equal(created.statusCode, 202, created.body)
    const id = created.json<{ id: string }>().id
    assert.equal(generated, 0); assert.equal(writes, 0)
    assert.equal(await prisma.cmsCorrection.count({ where: { tenantId: tenant.id, status: "QUEUED" } }), 2)
    assert.equal((await post("/batches", input)).statusCode, 409)
    assert.equal((await server.inject({ method: "POST", url: "/api/projects/" + other.id + "/cms/batches/" + id + "/cancel", headers, payload: "{}" })).statusCode, 404)
    await Promise.all([processCmsBatch(id, options), processCmsBatch(id, options)])
    assert.equal(generated, 2); assert.equal(writes, 0)
    const drafts = await prisma.cmsCorrection.findMany({ where: { tenantId: tenant.id, status: "DRAFT" } }); assert.equal(drafts.length, 2)
    assert.equal((await prisma.cmsBatch.findUniqueOrThrow({ where: { id } })).completed, 2)
    assert.equal((await post("/batches", { action: "APPLY", correctionIds: drafts.map(row => row.id) })).statusCode, 400)
    const publish = await post("/batches", { action: "APPLY", confirmed: true, correctionIds: drafts.map(row => row.id) }); assert.equal(publish.statusCode, 202)
    uncertain = true; await processCmsBatch(publish.json<{ id: string }>().id, options)
    assert.equal(writes, 1, "An uncertain publication stops the following writes")
    assert.equal(await prisma.cmsCorrection.count({ where: { tenantId: tenant.id, status: "UNCERTAIN" } }), 1)
    assert.equal(await prisma.cmsCorrection.count({ where: { tenantId: tenant.id, status: "DRAFT" } }), 1)
    const cancel = await post("/batches", input); assert.equal(cancel.statusCode, 202)
    assert.equal((await post("/batches/" + cancel.json<{ id: string }>().id + "/cancel", {})).statusCode, 200)
    await processCmsBatch(cancel.json<{ id: string }>().id, options); assert.equal(generated, 2)
    const revoked = await post("/batches", input); assert.equal(revoked.statusCode, 202)
    await prisma.user.update({ where: { id: user.id }, data: { role: "GUEST" } })
    await processCmsBatch(revoked.json<{ id: string }>().id, options); assert.equal(generated, 2, "Worker rechecks role before any AI request")
    const revokedRow = await prisma.cmsBatch.findUniqueOrThrow({ where: { id: revoked.json<{ id: string }>().id } }); assert.equal(revokedRow.failed, 2)
    await prisma.user.update({ where: { id: user.id }, data: { role: "MEMBER" } })
    await prisma.planConfig.update({ where: { plan: "PRO" }, data: { cmsMonthlyQuota: 6 } })
    assert.equal((await post("/batches", input)).statusCode, 403, "Batch reservation cannot exceed remaining quota")
    assert.equal((await post("/batches", { ...input, resources: [input.resources[0], input.resources[0]] })).statusCode, 400)
    await prisma.planConfig.update({ where: { plan: "PRO" }, data: { cmsMonthlyQuota: 30 } })
    if (process.env.TEST_REDIS_PORT) {
      const { Worker } = await import("bullmq"), { getCmsRedisConnection, cmsQueue, enqueueCmsBatch, closeCmsQueue } = await import("../apps/api/src/lib/cmsQueue")
      const { startServiceHeartbeat } = await import("../packages/shared/src/utils/serviceHeartbeat")
      let simulateFailure = true
      const worker = new Worker<{ batchId: string }>("cms-corrections", job => { if (simulateFailure) { simulateFailure = false; throw new Error("Temporary database outage before claim") }; return processCmsBatch(job.data.batchId, options) }, { connection: getCmsRedisConnection(), concurrency: 1 })
      const stop = startServiceHeartbeat(worker.client, "cms")
      try {
        await worker.waitUntilReady()
        const queued = await post("/batches", input), batchId = queued.json<{ id: string }>().id
        assert.equal(queued.statusCode, 202)
        await cmsQueue().add("cms", { batchId }, { jobId: batchId, attempts: 1 })
        for (let retry = 0; retry < 100; retry++) { if (await (await cmsQueue().getJob(batchId))?.getState() === "failed") break; await new Promise(resolve => setTimeout(resolve, 50)) }
        assert.equal(await (await cmsQueue().getJob(batchId))?.getState(), "failed")
        assert.equal((await prisma.cmsBatch.findUniqueOrThrow({ where: { id: batchId } })).status, "QUEUED")
        await Promise.all([enqueueCmsBatch(batchId), enqueueCmsBatch(batchId)])
        for (let retry = 0; retry < 100; retry++) {
          if ((await prisma.cmsBatch.findUniqueOrThrow({ where: { id: batchId } })).status === "COMPLETED") break
          await new Promise(resolve => setTimeout(resolve, 50))
        }
        assert.equal((await prisma.cmsBatch.findUniqueOrThrow({ where: { id: batchId } })).status, "COMPLETED")
        assert.equal(generated, 4, "Duplicate Redis handoffs never repeat a generation")
        assert.equal(writes, 1, "Real queue processing still never publishes a proposal")
        assert.deepEqual((await cmsQueue().getJob(batchId))?.data, { batchId }, "Redis contains only the durable batch ID")
        const redis = await worker.client
        assert.ok(Number(await redis.ttl("seo404:heartbeat:cms")) > 0)
        await stop(); assert.equal(await redis.get("seo404:heartbeat:cms"), null)
      } finally { await stop(); await worker.close(); await closeCmsQueue() }
    }
    const uncertainDraft = await prisma.cmsCorrection.findFirstOrThrow({ where: { tenantId: tenant.id, status: "UNCERTAIN" } })
    const { createCmsService } = await import("../apps/api/src/lib/cmsService"), service = createCmsService(options), actor = { projectId: project.id, tenantId: tenant.id, userId: user.id }
    assert.equal((await service.publishCorrection(actor, uncertainDraft.id, "reconcile")).status, "APPLIED")
    for (const mode of ["CONTENT", "ALT"] as const) {
      const proposal = await service.generateCorrection(actor, { resourceId: 2, kind: "page", mode }), before = JSON.stringify(resources.get(2)?.segments)
      assert.equal(proposal.status, "DRAFT"); assert.equal(proposal.beforePatches.length, 1); assert.equal(proposal.afterPatches.length, 1)
      assert.equal(JSON.stringify(resources.get(2)?.segments), before, "Generation has no side effect")
      assert.equal((await service.publishCorrection(actor, proposal.id, "apply")).status, "APPLIED")
      assert.equal((await service.publishCorrection(actor, proposal.id, "restore")).status, "RESTORED")
      assert.equal(JSON.stringify(resources.get(2)?.segments), before, "Restoration uses the exact stored source segments")
    }
  } finally {
    await server.close(); await prisma.tenant.deleteMany({ where: { id: tenant.id } }); await prisma.user.deleteMany({ where: { id: { in: [user.id, peer.id] } } })
    if (prior) await prisma.planConfig.update({ where: { plan: "PRO" }, data: { featureAI: prior.featureAI, featureCmsCorrections: prior.featureCmsCorrections, cmsMonthlyQuota: prior.cmsMonthlyQuota } })
    else await prisma.planConfig.deleteMany({ where: { plan: "PRO" } })
    await prisma.$disconnect()
  }
})
