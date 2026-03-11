// routes/scheduled.ts — Audits planifiés (weekly/monthly)
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { requireRole } from "../lib/guards"
import { requireAuditQuota } from "../lib/quotas"

const CreateScheduleSchema = z.object({
  projectId: z.string().cuid(),
  frequency: z.enum(["weekly", "monthly"]).default("weekly"),
  options: z
    .object({
      maxPages: z.number().int().min(1).max(500).default(100),
      maxDepth: z.number().int().min(1).max(10).default(5),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
    })
    .optional(),
})

function getNextRunDate(frequency: string): Date {
  const now = new Date()
  if (frequency === "weekly") {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
  // monthly
  const next = new Date(now)
  next.setMonth(next.getMonth() + 1)
  return next
}

const scheduledRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/scheduled — Liste des audits planifiés
  fastify.get("/api/scheduled", async (request, reply) => {
    const schedules = await prisma.scheduledAudit.findMany({
      where: { tenantId: request.tenantId, userId: request.userId },
      include: {
        project: { select: { name: true, domain: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(schedules)
  })

  // POST /api/scheduled — Créer un audit planifié
  fastify.post(
    "/api/scheduled",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const parse = CreateScheduleSchema.safeParse(request.body)
      if (!parse.success) {
        return reply.status(400).send({ error: "Données invalides", details: parse.error.flatten() })
      }

      const { projectId, frequency, options } = parse.data

      // Vérifier que le projet appartient à l'utilisateur
      const project = await prisma.project.findFirst({
        where: { id: projectId, tenantId: request.tenantId, userId: request.userId },
      })
      if (!project) return reply.status(404).send({ error: "Projet introuvable" })

      // Limiter à 1 schedule par projet
      const existing = await prisma.scheduledAudit.findFirst({
        where: { projectId, tenantId: request.tenantId, isActive: true },
      })
      if (existing) {
        return reply.status(409).send({ error: "Un audit planifié existe déjà pour ce projet" })
      }

      const schedule = await prisma.scheduledAudit.create({
        data: {
          tenantId: request.tenantId,
          userId: request.userId,
          projectId,
          frequency,
          options: options ?? {},
          nextRunAt: getNextRunDate(frequency),
        },
        include: {
          project: { select: { name: true, domain: true } },
        },
      })

      return reply.status(201).send(schedule)
    }
  )

  // PATCH /api/scheduled/:id — Modifier (activer/désactiver, changer fréquence)
  fastify.patch<{ Params: { id: string } }>(
    "/api/scheduled/:id",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const { isActive, frequency } = request.body as { isActive?: boolean; frequency?: string }

      const schedule = await prisma.scheduledAudit.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId },
      })
      if (!schedule) return reply.status(404).send({ error: "Planification introuvable" })

      const updateData: Record<string, unknown> = {}
      if (typeof isActive === "boolean") updateData.isActive = isActive
      if (frequency && ["weekly", "monthly"].includes(frequency)) {
        updateData.frequency = frequency
        updateData.nextRunAt = getNextRunDate(frequency)
      }

      const updated = await prisma.scheduledAudit.update({
        where: { id: schedule.id },
        data: updateData,
        include: { project: { select: { name: true, domain: true } } },
      })

      return reply.send(updated)
    }
  )

  // DELETE /api/scheduled/:id
  fastify.delete<{ Params: { id: string } }>(
    "/api/scheduled/:id",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const schedule = await prisma.scheduledAudit.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId, userId: request.userId },
      })
      if (!schedule) return reply.status(404).send({ error: "Planification introuvable" })

      await prisma.scheduledAudit.delete({ where: { id: schedule.id } })
      return reply.status(204).send()
    }
  )
}

export default scheduledRoutes
