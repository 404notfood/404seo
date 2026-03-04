// packages/scorer/src/index.ts
// Algorithme de scoring SEO pondéré

import type { CheckResult, LighthouseData } from "@seo/shared"
import type { AnalysisResult } from "@seo/analyzer"

// ─────────────────────────────────────────────
// PONDÉRATION DES CATÉGORIES
// ─────────────────────────────────────────────

const CATEGORY_WEIGHTS = {
  TECHNICAL:   0.30,  // 30%
  ON_PAGE:     0.30,  // 30%
  PERFORMANCE: 0.25,  // 25%
  UX_MOBILE:   0.15,  // 15%
}

// Poids des checks individuels dans leur catégorie
const CHECK_WEIGHTS: Record<string, number> = {
  // TECHNICAL
  https:           10,
  http_status:     10,
  indexability:     8,
  canonical:        6,
  lang_attribute:   4,
  robots_txt:       6,
  sitemap:          5,
  // ON_PAGE
  title:            8,
  meta_description: 8,
  h1:               7,
  images_alt:       4,
  schema_org:       3,
  open_graph:       4,
  heading_hierarchy: 4,
  word_count:       5,
  // PERFORMANCE (checks analyzer + Lighthouse)
  response_time:    8,
  page_size:        7,
  image_optimization: 5,
  internal_links:   5,
  external_links:   3,
  https_resources:  4,
  lcp:             10,
  cls:              8,
  fid:              5,
  ttfb:             7,
  // UX_MOBILE
  viewport:        10,
  mobile_friendly:  8,
  tap_targets:      5,
  font_size:        4,
}

// ─────────────────────────────────────────────
// CALCUL SCORE PAR CATÉGORIE
// ─────────────────────────────────────────────

export function calculateCategoryScore(checks: CheckResult[]): number {
  if (checks.length === 0) return 0

  let totalWeight = 0
  let weightedScore = 0

  for (const check of checks) {
    const weight = CHECK_WEIGHTS[check.checkName] ?? 5
    weightedScore += check.score * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0
}

// ─────────────────────────────────────────────
// SCORE PERFORMANCE (Lighthouse)
// ─────────────────────────────────────────────

export function calculatePerformanceScore(lighthouse?: LighthouseData): number {
  if (!lighthouse) return 0

  // LCP Score (0-100)
  const lcpMs = lighthouse.lcp
  const lcpScore = lcpMs < 2500 ? 100 : lcpMs < 4000 ? 60 : 0

  // CLS Score
  const cls = lighthouse.cls
  const clsScore = cls < 0.1 ? 100 : cls < 0.25 ? 60 : 0

  // TTFB Score
  const ttfbMs = lighthouse.ttfb
  const ttfbScore = ttfbMs < 600 ? 100 : ttfbMs < 1500 ? 60 : 0

  // Score Lighthouse général (0-1 → 0-100)
  const lighthouseScore = lighthouse.performance * 100

  // Pondération
  return Math.round(
    (lcpScore * 0.35) +
    (clsScore * 0.25) +
    (ttfbScore * 0.20) +
    (lighthouseScore * 0.20)
  )
}

// ─────────────────────────────────────────────
// SCORE GLOBAL
// ─────────────────────────────────────────────

export interface SEOScore {
  global: number
  technical: number
  onPage: number
  performance: number
  uxMobile: number
  grade: "A" | "B" | "C" | "D" | "F"
  summary: string
  criticalIssues: CheckResult[]
  warnings: CheckResult[]
  passed: CheckResult[]
}

export function calculateGlobalScore(analysis: AnalysisResult): SEOScore {
  const scoreTechnical = calculateCategoryScore(analysis.technical)
  const scoreOnPage = calculateCategoryScore(analysis.onPage)

  // Performance : blender checks analyzer + Lighthouse si disponible
  const scorePerformanceChecks = calculateCategoryScore(analysis.performance)
  const scorePerformanceLH = calculatePerformanceScore(analysis.lighthouse)
  const scorePerformance = analysis.lighthouse
    ? Math.round(scorePerformanceChecks * 0.4 + scorePerformanceLH * 0.6)
    : scorePerformanceChecks

  const scoreUXMobile = calculateCategoryScore(analysis.uxMobile)

  const global = Math.round(
    scoreTechnical * CATEGORY_WEIGHTS.TECHNICAL +
    scoreOnPage * CATEGORY_WEIGHTS.ON_PAGE +
    scorePerformance * CATEGORY_WEIGHTS.PERFORMANCE +
    scoreUXMobile * CATEGORY_WEIGHTS.UX_MOBILE
  )

  // Grade
  const grade: SEOScore["grade"] =
    global >= 90 ? "A" :
    global >= 75 ? "B" :
    global >= 60 ? "C" :
    global >= 40 ? "D" : "F"

  // Regrouper les issues
  const allChecks = [
    ...analysis.technical,
    ...analysis.onPage,
    ...analysis.performance,
    ...analysis.uxMobile,
  ]

  const criticalIssues = allChecks.filter((c) => c.status === "FAIL" && c.priority === "HIGH")
  const warnings = allChecks.filter((c) => c.status === "WARN" || (c.status === "FAIL" && c.priority !== "HIGH"))
  const passed = allChecks.filter((c) => c.status === "PASS")

  // Résumé
  const summary = grade === "A"
    ? "Excellente santé SEO. Quelques optimisations mineures possibles."
    : grade === "B"
      ? "Bonne santé SEO. Quelques problèmes à corriger."
      : grade === "C"
        ? "SEO moyen. Plusieurs problèmes importants à adresser."
        : grade === "D"
          ? "SEO faible. Actions urgentes requises."
          : "SEO critique. Refonte SEO complète nécessaire."

  return {
    global,
    technical: scoreTechnical,
    onPage: scoreOnPage,
    performance: scorePerformance,
    uxMobile: scoreUXMobile,
    grade,
    summary,
    criticalIssues,
    warnings,
    passed,
  }
}

// ─────────────────────────────────────────────
// GÉNÉRATION RECOMMANDATIONS
// ─────────────────────────────────────────────

export interface Recommendation {
  title: string
  description: string
  impact: "HIGH" | "MEDIUM" | "LOW"
  effort: "HIGH" | "MEDIUM" | "LOW"
  roi: number  // Impact/Effort ratio (0-10)
  checkName: string
}

export function generateRecommendations(score: SEOScore): Recommendation[] {
  const recs: Recommendation[] = []

  for (const issue of [...score.criticalIssues, ...score.warnings]) {
    const impactScore = issue.priority === "HIGH" ? 3 : issue.priority === "MEDIUM" ? 2 : 1
    const effortScore = issue.effort === "LOW" ? 3 : issue.effort === "MEDIUM" ? 2 : 1
    const roi = Math.round((impactScore / effortScore) * 3.33) // 0-10

    recs.push({
      title: formatCheckTitle(issue.checkName),
      description: issue.message,
      impact: issue.priority,
      effort: issue.effort,
      roi,
      checkName: issue.checkName,
    })
  }

  // Tri par ROI décroissant
  return recs.sort((a, b) => b.roi - a.roi)
}

function formatCheckTitle(checkName: string): string {
  const titles: Record<string, string> = {
    https: "Activer HTTPS",
    http_status: "Corriger le code HTTP",
    indexability: "Vérifier l'indexabilité",
    canonical: "Ajouter/corriger le canonical",
    response_time: "Améliorer le temps de réponse",
    title: "Optimiser la balise Title",
    meta_description: "Rédiger une meta description",
    h1: "Structurer le H1",
    images_alt: "Ajouter les attributs ALT",
    schema_org: "Implémenter Schema.org",
    page_size: "Réduire le poids de la page",
    image_optimization: "Optimiser les images",
    internal_links: "Améliorer le maillage interne",
    external_links: "Vérifier les liens externes",
    https_resources: "Corriger les ressources non-HTTPS",
    lang_attribute: "Ajouter l'attribut lang",
    robots_txt: "Créer un fichier robots.txt",
    sitemap: "Créer un sitemap XML",
    open_graph: "Ajouter les balises Open Graph",
    heading_hierarchy: "Corriger la hiérarchie des titres",
    word_count: "Enrichir le contenu textuel",
    mobile_friendly: "Optimiser pour mobile",
    viewport: "Ajouter la balise viewport",
    tap_targets: "Agrandir les cibles tactiles",
    font_size: "Augmenter la taille de police",
    lcp: "Améliorer le LCP (Core Web Vitals)",
    cls: "Corriger le CLS (Core Web Vitals)",
    ttfb: "Réduire le TTFB",
  }
  return titles[checkName] ?? checkName
}
