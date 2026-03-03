import "dotenv/config"
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import sensible from "@fastify/sensible"
import authPlugin from "./plugins/auth"
import auditsRoutes from "./routes/audits"
import projectsRoutes from "./routes/projects"
import billingRoutes from "./routes/billing"
import meRoutes from "./routes/me"
import tenantRoutes from "./routes/tenant"

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    },
  },
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
          done(null, JSON.parse(body.toString()))
        } catch (err) {
          done(err as Error, undefined)
        }
      }
    }
  )

  // Plugins
  await fastify.register(cors, {
    origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    credentials: true,
  })
  await fastify.register(cookie)
  await fastify.register(sensible)
  await fastify.register(authPlugin)

  // Routes
  await fastify.register(meRoutes)
  await fastify.register(auditsRoutes)
  await fastify.register(projectsRoutes)
  await fastify.register(billingRoutes)
  await fastify.register(tenantRoutes)

  // Health check
  fastify.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }))

  const port = parseInt(process.env.API_PORT || "4000")
  await fastify.listen({ port, host: "0.0.0.0" })
  console.log(`API Fastify démarrée sur http://localhost:${port}`)
}

start().catch((err) => {
  fastify.log.error(err)
  process.exit(1)
})
