import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { assertProjectOwner, requireRole, requireFeature } from "../lib/guards"
import { CmsError } from "../lib/cmsWordPress"
import { aiUsage, executeAiRequest, managedAiConfigured } from "../lib/aiBudget"
import { measureAiMention } from "../lib/aiVisibility"
const Input = z.object({ projectId: z.string().min(1).max(100), domain: z.string().min(3).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i), queries: z.array(z.string().trim().min(3).max(500)).min(1).max(3), engine: z.literal("openai").optional() }).strict()
const aiVisibilityRoutes: FastifyPluginAsync = async fastify => {
  fastify.get<{ Querystring: { domain?: string; engine?: string; limit?: string } }>("/api/ai-visibility", async request => {
    const { domain, engine } = request.query
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "50", 10) || 50))
    // Historical Claude records were produced by a provider-error fallback; exclude them from current statistics.
    const checks = await prisma.aIVisibilityCheck.findMany({ where: { tenantId: request.tenantId, ...(domain ? { domain } : {}), engine: engine ?? { startsWith: "openai:" } }, orderBy: { checkedAt: "desc" }, take: limit })
    const withPosition = checks.filter(check => check.mentioned && check.position !== null), mentioned = checks.filter(check => check.mentioned).length
    const byEngine: Record<string, { total: number; mentioned: number }> = {}
    for (const check of checks) { const stats = byEngine[check.engine] ??= { total: 0, mentioned: 0 }; stats.total++; if (check.mentioned) stats.mentioned++ }
    const usage = await aiUsage(request.tenantId)
    return { checks, usage: { ...usage, allowed: usage.allowed && request.role !== "GUEST" },
      stats: { total: checks.length, mentioned, mentionRate: checks.length ? Math.round(mentioned / checks.length * 100) : 0, avgPosition: withPosition.length ? Math.round(withPosition.reduce((sum, check) => sum + check.position!, 0) / withPosition.length * 10) / 10 : null, byEngine } }
  })
  fastify.post("/api/ai-visibility/check", { preHandler: [requireRole("MEMBER"), requireFeature("ai")], config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async request => {
    const parsed = Input.safeParse(request.body)
    if (!parsed.success || new Set(parsed.data.queries).size !== parsed.data.queries.length) throw new CmsError("Sélectionnez un projet et une à trois questions distinctes (500 caractères maximum).")
    const { projectId, domain, queries } = parsed.data, actor = { projectId, tenantId: request.tenantId, userId: request.userId }
    const project = await assertProjectOwner(projectId, request.userId, request.tenantId)
    if (!project) throw new CmsError("Projet introuvable.", 404)
    if (new URL(project.domain).hostname.replace(/^www\./i, "").toLowerCase() !== domain.replace(/^www\./i, "").toLowerCase()) throw new CmsError("Le domaine doit correspondre au projet sélectionné.")
    if (!managedAiConfigured()) throw new CmsError("Le fournisseur IA et ses tarifs doivent être configurés.", 503)
    let completed = 0, failed = 0
    for (const query of queries) {
      try {
        const result = await executeAiRequest(actor, "VISIBILITY", record => measureAiMention(query, domain, record))
        await prisma.$transaction(async tx => {
          await tx.$queryRawUnsafe('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', request.tenantId)
          const [tenant, user, owned] = await Promise.all([tx.tenant.findUnique({ where: { id: request.tenantId } }), tx.user.findFirst({ where: { id: request.userId, tenantId: request.tenantId, isBanned: false, role: { in: ["ADMIN", "MEMBER"] } } }), tx.project.findFirst({ where: { id: projectId, tenantId: request.tenantId, userId: request.userId, deletedAt: null } })])
          if (!tenant || tenant.isSuspended || !user || !owned) throw new CmsError("Accès refusé.", 403)
          await tx.aIVisibilityCheck.create({ data: { tenantId: request.tenantId, query, domain: domain.toLowerCase(), engine: "openai:" + process.env.OPENAI_SEO_MODEL, ...result } })
        })
        completed++
      } catch (error) {
        failed = queries.length - completed
        if (!completed) { if (error instanceof CmsError) throw error; throw new CmsError("La mesure IA a échoué. Aucun résultat n’a été enregistré.", 502) }
        break
      }
    }
    return { completed, failed, message: `${completed} réponse(s) mesurée(s), ${failed} question(s) non mesurée(s).` }
  })
  fastify.get("/api/ai-visibility/queries", async request => ({ queries: await prisma.aIVisibilityCheck.findMany({ where: { tenantId: request.tenantId }, select: { query: true, domain: true }, distinct: ["query"], orderBy: { checkedAt: "desc" }, take: 20 }) }))
  fastify.delete<{ Params: { id: string } }>("/api/ai-visibility/:id", { preHandler: [requireRole("MEMBER"), requireFeature("ai")] }, async (request, reply) => {
    const removed = await prisma.aIVisibilityCheck.deleteMany({ where: { id: request.params.id, tenantId: request.tenantId } })
    return removed.count ? reply.status(204).send() : reply.status(404).send({ error: "Mesure introuvable." })
  })
}
export default aiVisibilityRoutes
