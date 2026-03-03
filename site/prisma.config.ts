import { loadEnvFile } from "node:process"
import { defineConfig } from "prisma/config"

// Charge .env.local (Next.js convention) puis .env comme fallback
try { loadEnvFile(".env.local") } catch { /* fichier absent */ }
try { loadEnvFile(".env") } catch { /* fichier absent */ }

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"]!,
  },
})
