import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { requireRole } from "../lib/guards"
import { requireProjectQuota } from "../lib/quotas"
import { assertProjectCapacity, AuditQuotaError as ProjectQuotaError } from "@seo/shared/security"
import { isValidPublicUrlWithDns } from "@seo/crawler"

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().url(),
  description: z.string().max(500).optional(),
})

const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/projects — chaque user voit uniquement SES projets
  fastify.get("/api/projects", async (request, reply) => {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, tenantId: request.tenantId, userId: request.userId },
      include: {
        _count: { select: { audits: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(projects)
  })

  // POST /api/projects — MEMBER+ requis
  fastify.post("/api/projects", { preHandler: [requireRole("MEMBER"), requireProjectQuota()] }, async (request, reply) => {
    const parse = CreateProjectSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: "Données invalides", details: parse.error.flatten() })
    }

    const { name, domain, description } = parse.data
    if (!(await isValidPublicUrlWithDns(domain))) {
      return reply.status(400).send({ error: "URL du projet invalide ou non autorisée" })
    }

    let project
    try {
    project = await prisma.$transaction(async tx => {
      await assertProjectCapacity(tx, request.tenantId)
      return tx.project.create({
      data: {
        tenantId: request.tenantId,
        userId: request.userId,
        name,
        domain,
        description,
      },
    })
    })
    } catch (error) {
      if (error instanceof ProjectQuotaError) return reply.status(403).send({ error: error.message })
      throw error
    }

    return reply.status(201).send(project)
  })

  // DELETE /api/projects/:id — le propriétaire du projet peut supprimer
  fastify.delete<{ Params: { id: string } }>("/api/projects/:id", { preHandler: [requireRole("MEMBER")] }, async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { deletedAt: null, id: request.params.id, tenantId: request.tenantId, userId: request.userId },
    })

    if (!project) return reply.status(404).send({ error: "Projet introuvable" })

    await prisma.$transaction([
      prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } }),
      prisma.audit.updateMany({ where: { projectId: project.id, tenantId: request.tenantId }, data: { deletedAt: new Date() } }),
      prisma.scheduledAudit.updateMany({ where: { projectId: project.id, tenantId: request.tenantId }, data: { isActive: false, nextRunAt: null } }),
    ])

    return reply.status(204).send()
  })
}

export default projectsRoutes
