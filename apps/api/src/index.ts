import { config } from "dotenv"
import { resolve } from "path"

// Charger le .env depuis le dossier de l'API (indépendant du cwd PM2)
// __dirname pointe vers apps/api/src/, donc ../../.env = apps/api/.env
config({ path: resolve(process.cwd(), "apps/api/.env") })
// Fallback : si lancé depuis apps/api/
config({ path: resolve(process.cwd(), ".env") })
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import sensible from "@fastify/sensible"
import rateLimit from "@fastify/rate-limit"
import authPlugin from "./plugins/auth"
import auditsRoutes from "./routes/audits"
import projectsRoutes from "./routes/projects"
import billingRoutes from "./routes/billing"
import meRoutes from "./routes/me"
import tenantRoutes from "./routes/tenant"
import aggregationRoutes from "./routes/aggregation"
import localRoutes from "./routes/local"
import googleRoutes from "./routes/google"
import rankTrackingRoutes from "./routes/rank-tracking"
import backlinksRoutes from "./routes/backlinks"
import competitorsRoutes from "./routes/competitors"
import aiVisibilityRoutes from "./routes/ai-visibility"
import adminRoutes from "./routes/admin"

const isDev = process.env.NODE_ENV !== "production"

const fastify = Fastify({
  logger: isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : { level: "info" }, // JSON structuré en production
})

async function start() {
  // Parser raw body pour le webhook Stripe (doit être avant les routes)
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      if (req.url === "/api/billing/webhook") {
        done(null, body)
      } else {
        try {
          const str = body.toString().trim()
          done(null, str ? JSON.parse(str) : null)
        } catch (err) {
          done(err as Error, undefined)
        }
      }
    }
  )

  // Plugins
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      const allowed = [
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        process.env.BETTER_AUTH_URL,
        "http://localhost:3000",
        "https://seo.404notfood.fr",
      ].filter(Boolean)
      if (allowed.includes(origin) || /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) {
        cb(null, true)
      } else {
        cb(new Error("Not allowed by CORS"), false)
      }
    },
    credentials: true,
  })
  await fastify.register(cookie)
  await fastify.register(sensible)
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: ["/health", "/api/billing/webhook"],
  })
  await fastify.register(authPlugin)

  // Routes
  await fastify.register(meRoutes)
  await fastify.register(auditsRoutes)
  await fastify.register(projectsRoutes)
  await fastify.register(billingRoutes)
  await fastify.register(tenantRoutes)
  await fastify.register(aggregationRoutes)
  await fastify.register(localRoutes)
  await fastify.register(googleRoutes)
  await fastify.register(rankTrackingRoutes)
  await fastify.register(backlinksRoutes)
  await fastify.register(competitorsRoutes)
  await fastify.register(aiVisibilityRoutes)
  await fastify.register(adminRoutes)

  // Health check
  fastify.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }))

  const port = parseInt(process.env.API_PORT || "4000")
  await fastify.listen({ port, host: "0.0.0.0" })
  fastify.log.info(`API Fastify démarrée sur http://localhost:${port}`)
}

start().catch((err) => {
  fastify.log.error(err)
  process.exit(1)
})
