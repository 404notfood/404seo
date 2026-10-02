import type { Effort, Priority } from "./types/index"
import type { ActionPlanCheck, SearchConsolePageMetric, SeoActionItem } from "./types/actionPlan.types"

export const SEVERITY_WEIGHT: Record<Priority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }
export const EFFORT_WEIGHT: Record<Effort, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 }

/** Compatibility score used by existing reports: a heuristic, not financial ROI. */
export function impactEffortScore(priority: Priority, effort: Effort): number {
  return Math.min(10, Math.round(SEVERITY_WEIGHT[priority] / EFFORT_WEIGHT[effort] * 10 / 3))
}

export function normalizePageUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null
    url.hash = ""
    return url.href
  } catch { return null }
}

export function formatCheckTitle(checkName: string): string {
  const titles: Record<string, string> = {
    https: "Activer HTTPS", http_status: "Corriger le code HTTP", indexability: "Vérifier l’indexabilité",
    canonical: "Corriger la balise canonique", response_time: "Améliorer le temps de réponse",
    title: "Optimiser les titres", meta_description: "Rédiger les descriptions", h1: "Structurer le H1",
    images_alt: "Décrire les images", schema_org: "Ajouter des données structurées", page_size: "Réduire le poids des pages",
    image_optimization: "Optimiser les images", internal_links: "Améliorer le maillage interne",
    external_links: "Vérifier les liens externes", https_resources: "Corriger les ressources non sécurisées",
    lang_attribute: "Déclarer la langue", robots_txt: "Vérifier robots.txt", sitemap: "Vérifier le sitemap",
    open_graph: "Ajouter les balises Open Graph", heading_hierarchy: "Corriger la hiérarchie des titres",
    word_count: "Enrichir le contenu", mobile_friendly: "Optimiser pour mobile", viewport: "Configurer le viewport",
    tap_targets: "Agrandir les cibles tactiles", font_size: "Améliorer la lisibilité",
    lcp: "Améliorer le LCP", cls: "Réduire le CLS", inp: "Améliorer l’INP", ttfb: "Réduire le TTFB",
    hreflang: "Vérifier les versions linguistiques", security_headers: "Renforcer les en-têtes de sécurité",
    twitter_cards: "Configurer les aperçus Twitter", keyword_density: "Équilibrer l’usage des mots-clés",
    content_readability: "Améliorer la lisibilité du contenu", image_lazy_loading: "Différer le chargement des images",
  }
  return titles[checkName] ?? checkName.replaceAll("_", " ")
}

/** Only failing checks from ONE audit; one vote per URL, never per historical occurrence. */
export function buildActionItems(checks: ActionPlanCheck[], metrics: SearchConsolePageMetric[]): SeoActionItem[] {
  const byCheck = new Map<string, Map<string, ActionPlanCheck>>()
  for (const check of checks) {
    if (check.status === "PASS") continue
    const url = normalizePageUrl(check.pageUrl)
    if (!url) continue
    const pages = byCheck.get(check.checkName) ?? new Map<string, ActionPlanCheck>()
    const existing = pages.get(url)
    if (!existing || (existing.status === "WARN" && check.status === "FAIL")) pages.set(url, { ...check, pageUrl: url })
    byCheck.set(check.checkName, pages)
  }
  const metricsByUrl = new Map(metrics.map(metric => [normalizePageUrl(metric.pageUrl), metric]))
  return [...byCheck].map(([checkName, pages]) => {
    const issues = [...pages.values()]
    const priority = issues.reduce<Priority>((max, check) => SEVERITY_WEIGHT[check.priority] > SEVERITY_WEIGHT[max] ? check.priority : max, "LOW")
    const effort = issues.reduce<Effort>((max, check) => EFFORT_WEIGHT[check.effort] > EFFORT_WEIGHT[max] ? check.effort : max, "LOW")
    const failCount = issues.filter(check => check.status === "FAIL").length
    const matched = issues.flatMap(check => { const metric = metricsByUrl.get(check.pageUrl); return metric ? [metric] : [] })
    const impressions = matched.reduce((sum, row) => sum + row.impressions, 0)
    const clicks = matched.reduce((sum, row) => sum + row.clicks, 0)
    const search = matched.length ? {
      matchedPages: matched.length, impressions, clicks, ctr: impressions ? clicks / impressions : 0,
      position: impressions ? matched.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : 0,
    } : null
    const warnCount = issues.length - failCount
    const exposure = 1 + Math.min(1.5, Math.log10(1 + impressions) / 4)
    const priorityScore = Math.round((failCount * 3 + warnCount) * SEVERITY_WEIGHT[priority] / EFFORT_WEIGHT[effort] * exposure * 100) / 100
    return {
      checkName, title: formatCheckTitle(checkName), category: issues[0].category, priority, effort, priorityScore,
      reason: `${failCount} échec(s), ${warnCount} avertissement(s) sur ${issues.length} page(s). Gravité × occurrences ÷ effort${search ? `, pondérée par ${Math.round(impressions).toLocaleString("fr-FR")} impressions GSC sur ${matched.length} page(s) correspondante(s)` : "; aucune donnée GSC correspondante"}. Indice de priorité, sans promesse de gain de trafic.`,
      confidence: search ? (matched.length === issues.length ? "GSC_MATCHED" as const : "PARTIAL_GSC" as const) : "AUDIT_ONLY" as const,
      affectedPages: issues.length, failCount, warnCount, search,
      evidence: issues.sort((a, b) => (metricsByUrl.get(b.pageUrl)?.impressions ?? 0) - (metricsByUrl.get(a.pageUrl)?.impressions ?? 0)).slice(0, 5).map(({ pageUrl, status, value, expected, message }) => ({ pageUrl, status, value, expected, message })),
      status: "OPEN" as const, note: "", implementedAt: null, verifiedAt: null, verifiedAuditId: null,
    }
  }).sort((a, b) => b.priorityScore - a.priorityScore || a.checkName.localeCompare(b.checkName))
}

export function correctionVerification(checkName: string, expectedPageUrls: string[], checks: ActionPlanCheck[]): string | null {
  if (!expectedPageUrls.length) return "Aucune page de référence enregistrée."
  const relevant = checks.filter(check => check.checkName === checkName)
  if (relevant.some(check => check.status !== "PASS")) return "Le dernier audit détecte encore ce problème."
  const passing = new Set(relevant.filter(check => check.status === "PASS").map(check => normalizePageUrl(check.pageUrl)))
  if (expectedPageUrls.some(url => !passing.has(normalizePageUrl(url)))) return "Certaines pages de référence n’ont pas été contrôlées dans ce nouvel audit."
  return null
}
