import { prisma } from "./prisma"

// Mapping clé feature → champ PlanConfig
const FEATURE_TO_CONFIG_KEY: Record<string, string> = {
  ai: "featureAI",
  rank_tracking: "featureRankTracking",
  local_seo: "featureLocalSeo",
  white_label: "featureWhiteLabel",
  api_access: "featureApiAccess",
  competitors: "featureCompetitors",
  backlinks: "featureBacklinks",
}

export const FEATURES = [
  { key: "ai",            label: "Visibilité IA + suggestions" },
  { key: "rank_tracking", label: "Suivi de positions" },
  { key: "local_seo",     label: "SEO Local (GBP, avis, posts)" },
  { key: "white_label",   label: "Marque blanche (logo, couleurs, PDF)" },
  { key: "api_access",    label: "Accès API REST" },
  { key: "competitors",   label: "Analyse concurrents" },
  { key: "backlinks",     label: "Profil de backlinks" },
]

/**
 * Résout l'accès d'un tenant à une feature :
 * 1. Override admin (TenantFeature) → prioritaire
 * 2. Défaut du plan (PlanConfig)
 */
export async function resolveFeature(tenantId: string, feature: string): Promise<boolean> {
  // 1. Override admin ?
  const override = await prisma.tenantFeature.findUnique({
    where: { tenantId_feature: { tenantId, feature } },
    select: { enabled: true },
  })
  if (override !== null) return override.enabled

  // 2. Défaut du plan
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  })
  if (!tenant) return false

  const config = await prisma.planConfig.findUnique({
    where: { plan: tenant.plan },
  })
  if (!config) return false

  const key = FEATURE_TO_CONFIG_KEY[feature]
  if (!key) return false

  return (config as Record<string, unknown>)[key] as boolean ?? false
}

/**
 * Résout toutes les features d'un tenant avec le détail (défaut plan + override).
 */
export async function resolveAllFeatures(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  })
  if (!tenant) return []

  const [config, overrides] = await Promise.all([
    prisma.planConfig.findUnique({ where: { plan: tenant.plan } }),
    prisma.tenantFeature.findMany({ where: { tenantId } }),
  ])

  return FEATURES.map(({ key, label }) => {
    const configKey = FEATURE_TO_CONFIG_KEY[key]
    const planDefault = config ? ((config as Record<string, unknown>)[configKey] as boolean ?? false) : false
    const overrideRecord = overrides.find((o) => o.feature === key)
    const overrideValue = overrideRecord ? overrideRecord.enabled : null
    const enabled = overrideValue !== null ? overrideValue : planDefault
    return { key, label, planDefault, override: overrideValue, enabled }
  })
}
