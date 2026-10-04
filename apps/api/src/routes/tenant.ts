import type { FastifyPluginAsync } from "fastify"
import { prisma } from "../lib/prisma"
import { z } from "zod"
import { isValidPublicUrlWithDns } from "@seo/shared/security"

const BrandingSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  logoUrl: z.string().max(2048).nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
}).strict()

const tenantRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/tenant — infos tenant + branding
  fastify.get("/api/tenant", async (request) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        logoUrl: true,
        brandColor: true,
        customDomain: true,
      },
    })

    if (!tenant) {
      throw fastify.httpErrors.notFound("Tenant introuvable")
    }

    return tenant
  })

  // PUT /api/tenant/branding — modifier branding (ADMIN only)
  fastify.put("/api/tenant/branding", async (request, reply) => {
    if (request.role !== "ADMIN") {
      return reply.status(403).send({ error: "Réservé aux administrateurs" })
    }

    const parsed = BrandingSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: "Branding invalide" })
    const { name, logoUrl, brandColor } = parsed.data
    if (logoUrl && !(await isValidPublicUrlWithDns(logoUrl))) {
      return reply.status(400).send({ error: "URL du logo non autorisée" })
    }
    const updated = await prisma.tenant.update({
      where: { id: request.tenantId },
      data: {
        ...(name !== undefined && { name }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
        ...(brandColor !== undefined && { brandColor: brandColor || "#2563eb" }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        logoUrl: true,
        brandColor: true,
        customDomain: true,
      },
    })

    return updated
  })
}

export default tenantRoutes
