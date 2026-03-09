import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { requireRole } from "../lib/guards"

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  domain: z.string().url(),
  description: z.string().max(500).optional(),
})

const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/projects — chaque user voit uniquement SES projets
  fastify.get("/api/projects", async (request, reply) => {
    const projects = await prisma.project.findMany({
      where: { tenantId: request.tenantId, userId: request.userId },
      include: {
        _count: { select: { audits: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(projects)
  })

  // POST /api/projects — MEMBER+ requis
  fastify.post("/api/projects", { preHandler: [requireRole("MEMBER")] }, async (request, reply) => {
    const parse = CreateProjectSchema.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: "Données invalides", details: parse.error.flatten() })
    }

    const { name, domain, description } = parse.data

    const project = await prisma.project.create({
      data: {
        tenantId: request.tenantId,
        userId: request.userId,
        name,
        domain,
        description,
      },
    })

    return reply.status(201).send(project)
  })

  // DELETE /api/projects/:id — le propriétaire du projet peut supprimer
  fastify.delete<{ Params: { id: string } }>("/api/projects/:id", { preHandler: [requireRole("MEMBER")] }, async (request, reply) => {
    const project = await prisma.project.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId },
    })

    if (!project) return reply.status(404).send({ error: "Projet introuvable" })

    await prisma.project.delete({ where: { id: project.id } })

    return reply.status(204).send()
  })
}

export default projectsRoutes
