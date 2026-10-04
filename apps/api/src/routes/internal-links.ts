import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { buildInternalLinkAnalysis } from "@seo/shared"
import type { ProjectInternalLinks } from "@seo/shared"
import { prisma } from "../lib/prisma"
import { assertProjectOwner } from "../lib/guards"
import { loadLinkingAuditPages } from "../lib/internalLinks"

const Scope = z.object({ projectId: z.string().min(1).max(100) })
const Query = z.object({ view: z.enum(["suggestions", "pages", "anchors"]).default("suggestions"), q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1), unlinked: z.enum(["true", "false"]).default("false") }).strict()

const internalLinkRoutes: FastifyPluginAsync = async fastify => {
  fastify.get<{ Params: { projectId: string } }>("/api/projects/:projectId/internal-links", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const scope = Scope.safeParse(request.params), query = Query.safeParse(request.query)
    if (!scope.success || !query.success) return reply.status(400).send({ error: "Filtres ou projet invalides" })
    const project = await assertProjectOwner(scope.data.projectId, request.userId, request.tenantId)
    if (!project) return reply.status(404).send({ error: "Projet introuvable" })
    const audit = await prisma.audit.findFirst({ where: { projectId: project.id, tenantId: request.tenantId, userId: request.userId, deletedAt: null, status: "COMPLETED" },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }], select: { id: true, url: true, completedAt: true, _count: { select: { pages: true } } } })
    const pages = audit ? await loadLinkingAuditPages(audit.id, request.tenantId) : []
    const analysis = buildInternalLinkAnalysis(pages, project.domain, audit?.url ?? project.domain)
    analysis.limits.pages ||= (audit?._count.pages ?? 0) > pages.length
    const { view, q, unlinked } = query.data
    const needle = q.toLocaleLowerCase("fr")
    const includes = (...values: string[]) => values.some(value => value.toLocaleLowerCase("fr").includes(needle))
    const nodes = analysis.nodes.filter(node => includes(node.url, node.title) && (unlinked !== "true" || node.incoming === 0 && node.depth !== 0))
    const suggestions = analysis.suggestions.filter(item => includes(item.sourceUrl, item.targetUrl, item.sourceTitle, item.targetTitle, item.anchor))
    const anchors = analysis.anchorIssues.filter(item => includes(item.sourceUrl, item.targetUrl, item.anchor))
    const total = view === "pages" ? nodes.length : view === "anchors" ? anchors.length : suggestions.length
    const pageCount = Math.max(1, Math.ceil(total / 25)), page = Math.min(query.data.page, pageCount), offset = (page - 1) * 25
    const result: ProjectInternalLinks = { summary: analysis.summary, limits: analysis.limits,
      audit: audit ? { id: audit.id, completedAt: audit.completedAt?.toISOString() ?? null, pageCount: audit._count.pages } : null,
      view, page, pageCount, total, nodes: view === "pages" ? nodes.slice(offset, offset + 25) : [], suggestions: view === "suggestions" ? suggestions.slice(offset, offset + 25) : [], anchorIssues: view === "anchors" ? anchors.slice(offset, offset + 25) : [] }
    return reply.send(result)
  })
}
export default internalLinkRoutes
