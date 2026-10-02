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
import scheduledRoutes from "./routes/scheduled"
import actionPlanRoutes from "./routes/action-plan"
import { captureError } from "./lib/monitoring"
import { isAllowedOrigin } from "./lib/securityPolicy"
import { crawlQueue, redis } from "./lib/redis"
import { prisma } from "./lib/prisma"
import { assertProductionEnvironment } from "@seo/shared/security"

const isDev = process.env.NODE_ENV !== "production"

const fastify = Fastify({
  trustProxy: isDev ? false : ["127.0.0.1", "::1"],
  bodyLimit: 1024 * 1024,
  logger: isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : { level: "info", redact: ["req.headers.authorization", "req.headers.cookie", "res.headers[\"set-cookie\"]"] }, // JSON structuré en production
})

async function start() {
  assertProductionEnvironment()
  // Parser raw body pour le webhook Stripe (doit être avant les routes)
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      if (req.url.split("?")[0] === "/api/billing/webhook") {
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
      const allowLan = isDev && /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)
      if (isAllowedOrigin(origin) || allowLan) {
        cb(null, true)      } else {
        cb(null, false)
      }
    },
    credentials: true,
  })
  await fastify.register(cookie)
  await fastify.register(sensible)
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    redis,
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
  await fastify.register(scheduledRoutes)
  await fastify.register(actionPlanRoutes)

  // Monitoring d'erreurs global
  fastify.setErrorHandler(async (error: { statusCode?: number; message: string }, request, reply) => {
    captureError(error instanceof Error ? error : new Error(error.message), {
      route: `${request.method} ${request.url}`,
      userId: request.userId,
      tenantId: request.tenantId,
    })
    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Erreur interne du serveur" : error.message,
    })
  })

  // Health check
  fastify.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }))

  const port = parseInt(process.env.API_PORT || "4000")
  const host = process.env.API_HOST || (isDev ? "0.0.0.0" : "127.0.0.1")
  await fastify.listen({ port, host })
  fastify.log.info(`API Fastify démarrée sur http://${host}:${port}`)
}

start().catch((err) => {
  fastify.log.error(err)
  process.exit(1)
})

// Capture des erreurs non gérées globalement
process.on("uncaughtException", (err) => {
  captureError(err, { extra: { type: "uncaughtException" } })
  console.error("Uncaught Exception:", err)
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  captureError(reason instanceof Error ? reason : new Error(String(reason)), { extra: { type: "unhandledRejection" } })
  console.error("Unhandled Rejection:", reason)
})

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  await fastify.close()
  await crawlQueue.close()
  await redis.quit()
  await prisma.$disconnect()
}
process.on("SIGTERM", () => void shutdown())
process.on("SIGINT", () => void shutdown())
