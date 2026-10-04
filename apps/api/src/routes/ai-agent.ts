import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { plainCmsText } from "@seo/crawler"
import { prisma } from "../lib/prisma"
import { assertProjectOwner, requireRole, requireFeature } from "../lib/guards"
import { AiChatInput, agentPayload, requestAgentReply } from "../lib/aiAgent"
import { aiUsage, executeAiRequest } from "../lib/aiBudget"
import { CmsError } from "../lib/cmsWordPress"
const Params = z.object({ projectId: z.string().min(1).max(100) })
const aiAgentRoutes: FastifyPluginAsync = async fastify => {
  async function context(projectId: string, userId: string, tenantId: string) {
    const project = await assertProjectOwner(projectId, userId, tenantId)
    if (!project) throw new CmsError("Projet introuvable.", 404)
    const audit = await prisma.audit.findFirst({ where: { projectId, tenantId, userId, deletedAt: null, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, include: { report: true } })
    if (!audit) return null
    const issues = await prisma.pageResult.findMany({ where: { tenantId, status: "FAIL", page: { auditId: audit.id, tenantId } }, orderBy: [{ priority: "asc" }, { id: "asc" }], take: 12, select: { checkName: true, message: true, priority: true, page: { select: { url: true } } } })
    return { auditId: audit.id, auditedAt: (audit.completedAt ?? audit.createdAt).toISOString(), domain: project.domain,
      scores: audit.report ? { global: audit.report.scoreGlobal, technical: audit.report.scoreTechnical, onPage: audit.report.scoreOnPage, performance: audit.report.scorePerformance, ux: audit.report.scoreUX, totalPages: audit.report.totalPages, totalIssues: audit.report.totalIssues, criticalIssues: audit.report.criticalIssues } : null,
      issues: issues.map(issue => ({ check: issue.checkName, message: plainCmsText(issue.message, 300), priority: issue.priority, url: issue.page.url.slice(0, 2048) })),
      coverage: "Dernier audit terminé, jusqu’à 12 contrôles en échec. Aucun accès aux données non fournies ni au CMS." }
  }
  const prefix = "/api/projects/:projectId/ai-agent"
  fastify.get<{ Params: { projectId: string } }>(prefix, { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async request => {
    const { projectId } = Params.parse(request.params), audit = await context(projectId, request.userId, request.tenantId)
    const usage = await aiUsage(request.tenantId)
    return { auditId: audit?.auditId ?? null, auditedAt: audit?.auditedAt ?? null, usage: { ...usage, allowed: usage.allowed && request.role !== "GUEST" } }
  })
  fastify.post<{ Params: { projectId: string } }>(prefix, { preHandler: [requireRole("MEMBER"), requireFeature("ai")], config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async request => {
    const parsed = AiChatInput.safeParse(request.body)
    if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") throw new CmsError("Conversation invalide : terminez par votre question (1 500 caractères maximum).")
    const { projectId } = Params.parse(request.params), audit = await context(projectId, request.userId, request.tenantId)
    if (!audit) throw new CmsError("Terminez un audit sur ce projet pour interroger l’agent.", 409)
    const body = agentPayload(audit, parsed.data.messages)
    const content = await executeAiRequest({ projectId, tenantId: request.tenantId, userId: request.userId }, "CHAT", record => requestAgentReply(body, record))
    return { content, auditId: audit.auditId, auditedAt: audit.auditedAt, usage: await aiUsage(request.tenantId) }
  })
}
export default aiAgentRoutes
