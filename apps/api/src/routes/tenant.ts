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

    // Validation URL logo : uniquement http(s) public (anti LFI/SSRF dans le PDF)
    if (logoUrl && logoUrl.length > 0) {
      let parsed: URL
      try {
        parsed = new URL(logoUrl)
      } catch {
        return reply.status(400).send({ error: "URL du logo invalide" })
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return reply.status(400).send({ error: "URL du logo invalide (http/https requis)" })
      }
      const host = parsed.hostname.toLowerCase()
      const isInternal =
        host === "localhost" ||
        host === "0.0.0.0" ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      if (isInternal) {
        return reply.status(400).send({ error: "URL du logo non autorisée" })
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
