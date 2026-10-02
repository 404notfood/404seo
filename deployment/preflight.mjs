import { readFileSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "dotenv"
import { PrismaClient } from "@prisma/client"

export function checkProductionConfig(env) {
  const errors = [], warnings = []
  const placeholder = value => !value || /(?:TODO_FILL|changeme|PASSWORD|USER:|\.\.\.|<openssl|replace[_ -]?me)/i.test(value)
  for (const field of ["BETTER_AUTH_SECRET", "DATABASE_URL"]) if (placeholder(env[field])) errors.push(field + " manquant ou valeur d’exemple")
  if ((env.BETTER_AUTH_SECRET ?? "").length < 32) errors.push("BETTER_AUTH_SECRET doit contenir au moins 32 caractères")
  for (const field of ["BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_API_URL"]) if (env[field]?.replace(/\/$/, "") !== "https://seo.404notfood.fr") errors.push(field + " doit utiliser l’origine HTTPS de seo.404notfood.fr")
  try { const db = new URL(env.DATABASE_URL); if (!["postgres:", "postgresql:"].includes(db.protocol) || !db.username || !db.password) errors.push("DATABASE_URL doit contenir un compte PostgreSQL dédié avec mot de passe") } catch { errors.push("DATABASE_URL invalide") }
  if (env.API_HOST !== "127.0.0.1" || env.API_PORT !== "4000") errors.push("L’API doit écouter sur 127.0.0.1:4000 derrière Hestia")
  if (!["127.0.0.1", "localhost", "::1"].includes(env.REDIS_HOST)) errors.push("Redis doit rester sur l’interface locale")
  if (!/^\d+$/.test(env.REDIS_PORT ?? "") || Number(env.REDIS_PORT) < 1 || Number(env.REDIS_PORT) > 65535) errors.push("REDIS_PORT invalide")
  if (!/^[a-f0-9]{64}$/i.test(env.CMS_CREDENTIAL_KEY ?? "")) warnings.push("Connexions CMS désactivées : CMS_CREDENTIAL_KEY absente ou invalide")
  const aiFields = ["OPENAI_API_KEY", "OPENAI_SEO_MODEL", "OPENAI_SEO_INPUT_USD_PER_MILLION", "OPENAI_SEO_OUTPUT_USD_PER_MILLION"]
  if (aiFields.some(field => placeholder(env[field]))) warnings.push("IA gérée désactivée : fournisseur, modèle ou tarifs incomplets")
  for (const field of aiFields.slice(2)) if (env[field] && (!Number.isFinite(Number(env[field])) || Number(env[field]) <= 0 || Number(env[field]) > 1000)) errors.push(field + " doit être un tarif USD positif par million de jetons")
  for (const fields of [["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"], ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"]]) if (fields.some(field => placeholder(env[field]))) warnings.push(fields.join(" / ") + " : intégration à configurer")
  if (placeholder(env.RESEND_API_KEY)) warnings.push("RESEND_API_KEY absente : emails et vérification des inscriptions indisponibles")
  if (!env.EMAIL_FROM) warnings.push("EMAIL_FROM manquant")
  if (env.ANTHROPIC_API_KEY) warnings.push("Suggestions d’avis Anthropic : comptabilité séparée à intégrer avant commercialisation")
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_REDIRECT_URI !== "https://seo.404notfood.fr/api/google/callback") errors.push("GOOGLE_REDIRECT_URI ne correspond pas au callback de production")
  if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY ?? "") || !env.BACKUP_DIR) warnings.push("Sauvegardes chiffrées à configurer : BACKUP_ENCRYPTION_KEY et BACKUP_DIR")
  if (env.BACKUP_ENCRYPTION_KEY && env.BACKUP_ENCRYPTION_KEY === env.CMS_CREDENTIAL_KEY) errors.push("La clé de sauvegarde doit être différente de la clé CMS")
  return { errors, warnings }
}

export async function preflight(envFile, { commercial = false, configOnly = false } = {}) {
  let env
  try {
    const file = statSync(envFile)
    if (process.platform !== "win32" && (file.mode & 0o077)) throw new Error("permissions")
    env = { ...process.env, ...parse(readFileSync(envFile)) }
  } catch { throw new Error("Fichier de production manquant, illisible ou accessible à d’autres comptes (chmod 600 requis).") }
  const result = checkProductionConfig(env)
  const company = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../site/lib/config/CompanyConfig.ts"), "utf8")
  if (/CompanyConfig\.TODO_FILL[,)]/.test(company)) result.warnings.push("Informations de société et d’hébergement à compléter dans CompanyConfig.ts")
  if (Number(process.versions.node.split(".")[0]) < 22) result.errors.push("Node.js 22 ou supérieur requis pour ce déploiement")
  if (!configOnly && !result.errors.length) {
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })
    try {
      const failed = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`
      if (failed.length) result.errors.push("Une migration PostgreSQL reste en échec")
      const plans = await prisma.planConfig.findMany({ where: { isActive: true } })
      if (!plans.length) result.warnings.push("Aucun plan actif configuré dans l’administration")
      for (const plan of plans) {
        if (plan.featureAI && (!plan.aiMonthlyQuota || !plan.aiMonthlyBudgetCents)) result.warnings.push("Plan " + plan.plan + " : quota ou budget IA nul")
        if (plan.featureCmsCorrections && !plan.cmsMonthlyQuota) result.warnings.push("Plan " + plan.plan + " : quota CMS nul")
        if (plan.price > 0 && !/^price_/.test(plan.stripePriceId ?? "")) result.warnings.push("Plan " + plan.plan + " : prix Stripe mensuel absent")
      }
    } catch { result.errors.push("Base ou migrations non prêtes pour la version déployée") } finally { await prisma.$disconnect() }
  }
  if (commercial) result.errors.push(...result.warnings.map(value => "Commercialisation : " + value))
  return result
}
async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  try {
    const result = await preflight(resolve(root, ".env.production"), { commercial: process.argv.includes("--commercial"), configOnly: process.argv.includes("--config-only") })
    for (const error of result.errors) console.error("ERREUR : " + error)
    for (const warning of result.warnings) console.warn("À CONFIGURER : " + warning)
    console.log("Contrôle de configuration terminé. Il ne valide pas les comptes des fournisseurs ni le DNS/TLS publics.")
    if (result.errors.length) process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
