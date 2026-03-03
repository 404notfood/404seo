import type { FastifyPluginAsync } from "fastify"
import { prisma } from "../lib/prisma"

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

    const { name, logoUrl, brandColor } = request.body as {
      name?: string
      logoUrl?: string | null
      brandColor?: string | null
    }

    // Validation couleur hexadécimale
    if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
      return reply.status(400).send({ error: "Couleur invalide (format #RRGGBB)" })
    }

    // Validation URL logo
    if (logoUrl && logoUrl.length > 0) {
      try {
        new URL(logoUrl)
      } catch {
        return reply.status(400).send({ error: "URL du logo invalide" })
      }
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
