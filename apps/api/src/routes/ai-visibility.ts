// routes/ai-visibility.ts — Suivi de visibilité dans les IA génératives
import type { FastifyPluginAsync } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { requireRole } from "../lib/guards.js"

const CheckVisibilitySchema = z.object({
  domain: z.string().min(3),
  queries: z.array(z.string().min(3)).min(1).max(10),
  engine: z.enum(["claude"]).default("claude"), // seul Claude disponible sans clé tierce
})

const AddQuerySchema = z.object({
  query: z.string().min(3).max(500),
  domain: z.string().min(3),
})

// ── Appel API Anthropic via fetch ─────────────────────────────────────────────
async function callClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`)
  const data = await res.json() as { content: Array<{ type: string; text?: string }> }
  return data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
}

// ── Vérifier la présence d'un domaine dans une réponse Claude ─────────────────
async function checkWithClaude(
  query: string,
  domain: string
): Promise<{ mentioned: boolean; position: number | null; snippet: string | null }> {
  try {
    const prompt = `Tu es un assistant SEO. Réponds à cette question comme tu le ferais normalement, en recommandant des outils/sites/services si pertinent.

Question : ${query}

Donne une réponse concise et pratique.`

    const responseText = await callClaude(prompt)

    // Détecter si le domaine est mentionné
    const domainVariants = [
      domain,
      domain.replace(/^www\./, ""),
      `www.${domain.replace(/^www\./, "")}`,
    ]

    let mentioned = false
    let position: number | null = null
    let snippet: string | null = null

    for (const variant of domainVariants) {
      const idx = responseText.toLowerCase().indexOf(variant.toLowerCase())
      if (idx !== -1) {
        mentioned = true
        // Extraire un snippet autour de la mention
        const start = Math.max(0, idx - 60)
        const end = Math.min(responseText.length, idx + 100)
        snippet = "..." + responseText.slice(start, end) + "..."

        // Estimer la position (numéro d'ordre de la mention parmi tous les domaines/URLs cités)
        const urlPattern = /(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}/gi
        const allUrls = [...responseText.matchAll(urlPattern)].map((m) => m[0].toLowerCase())
        const posIdx = allUrls.findIndex((u) => domainVariants.some((v) => u.includes(v.toLowerCase())))
        position = posIdx !== -1 ? posIdx + 1 : 1
        break
      }
    }

    return { mentioned, position, snippet }
  } catch {
    return { mentioned: false, position: null, snippet: null }
  }
}

const aiVisibilityRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/ai-visibility — Résultats des checks
  fastify.get<{ Querystring: { domain?: string; engine?: string; limit?: string } }>(
    "/api/ai-visibility",
    async (request, reply) => {
      const { domain, engine, limit: limitStr } = request.query
      const limit = Math.min(100, parseInt(limitStr ?? "50"))

      const checks = await prisma.aIVisibilityCheck.findMany({
        where: {
          tenantId: request.tenantId,
          ...(domain ? { domain } : {}),
          ...(engine ? { engine } : {}),
        },
        orderBy: { checkedAt: "desc" },
        take: limit,
      })

      // Stats
      const total = checks.length
      const mentioned = checks.filter((c) => c.mentioned).length
      const mentionRate = total > 0 ? Math.round((mentioned / total) * 100) : 0
      const withPosition = checks.filter((c) => c.mentioned && c.position != null)
      const avgPosition =
        withPosition.length > 0
          ? Math.round((withPosition.reduce((s, c) => s + (c.position ?? 0), 0) / withPosition.length) * 10) / 10
          : null

      // Par moteur
      const byEngine = checks.reduce<Record<string, { total: number; mentioned: number }>>((acc, c) => {
        if (!acc[c.engine]) acc[c.engine] = { total: 0, mentioned: 0 }
        acc[c.engine]!.total++
        if (c.mentioned) acc[c.engine]!.mentioned++
        return acc
      }, {})

      return reply.send({
        checks,
        stats: { total, mentioned, mentionRate, avgPosition, byEngine },
      })
    }
  )

  // POST /api/ai-visibility/check — Lancer des vérifications
  fastify.post(
    "/api/ai-visibility/check",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        return reply.status(400).send({ error: "ANTHROPIC_API_KEY non configurée" })
      }

      const parse = CheckVisibilitySchema.safeParse(request.body)
      if (!parse.success) return reply.status(400).send({ error: "Données invalides" })
      const { domain, queries } = parse.data

      reply.status(202).send({ message: `${queries.length} vérifications lancées`, domain })

      // Checks asynchrones séquentiels (éviter flood API)
      setImmediate(async () => {
        for (const query of queries) {
          try {
            const result = await checkWithClaude(query, domain)
            await prisma.aIVisibilityCheck.create({
              data: {
                tenantId: request.tenantId,
                query,
                engine: "claude",
                domain,
                mentioned: result.mentioned,
                position: result.position,
                snippet: result.snippet,
              },
            })
            // Délai pour éviter de saturer l'API
            await new Promise((r) => setTimeout(r, 1500))
          } catch (err) {
            fastify.log.error({ err }, `Erreur AI visibility check pour "${query}"`)
          }
        }
      })
    }
  )

  // GET /api/ai-visibility/queries — Liste des requêtes suggérées
  fastify.get("/api/ai-visibility/queries", async (request, reply) => {
    // Retourner les requêtes déjà utilisées par ce tenant + suggestions basées sur les mots-clés SEO
    const existing = await prisma.aIVisibilityCheck.findMany({
      where: { tenantId: request.tenantId },
      select: { query: true, domain: true },
      distinct: ["query"],
      orderBy: { checkedAt: "desc" },
      take: 20,
    })

    return reply.send({ queries: existing })
  })

  // DELETE /api/ai-visibility/:id
  fastify.delete<{ Params: { id: string } }>(
    "/api/ai-visibility/:id",
    { preHandler: [requireRole("MEMBER")] },
    async (request, reply) => {
      const check = await prisma.aIVisibilityCheck.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
      })
      if (!check) return reply.status(404).send({ error: "Check introuvable" })
      await prisma.aIVisibilityCheck.delete({ where: { id: check.id } })
      return reply.status(204).send()
    }
  )
}

export default aiVisibilityRoutes
