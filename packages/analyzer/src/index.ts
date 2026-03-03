// packages/analyzer/src/index.ts
// Analyse SEO complète d'une page crawlée

import type { PageData } from "@seo/shared"

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type CheckStatus = "PASS" | "WARN" | "FAIL"
export type Category = "TECHNICAL" | "ON_PAGE" | "PERFORMANCE" | "UX_MOBILE"
export type Priority = "HIGH" | "MEDIUM" | "LOW"
export type Effort = "HIGH" | "MEDIUM" | "LOW"

export interface CheckResult {
  category: Category
  checkName: string
  status: CheckStatus
  score: number       // 0-100
  value?: string      // valeur mesurée
  expected?: string   // valeur attendue
  message: string
  priority: Priority
  effort: Effort
}

export interface AnalysisResult {
  technical: CheckResult[]
  onPage: CheckResult[]
  performance: CheckResult[]
  uxMobile: CheckResult[]
  lighthouse?: LighthouseData
}

export interface LighthouseData {
  performance: number
  accessibility: number
  seo: number
  lcp: number   // ms
  cls: number
  fid: number   // ms
  ttfb: number  // ms
  tbt: number   // ms
}

// ─────────────────────────────────────────────
// ANALYSE TECHNIQUE
// ─────────────────────────────────────────────

export function analyzeTechnical(page: PageData): CheckResult[] {
  const results: CheckResult[] = []

  // HTTPS
  const isHttps = page.url.startsWith("https://")
  results.push({
    category: "TECHNICAL",
    checkName: "https",
    status: isHttps ? "PASS" : "FAIL",
    score: isHttps ? 100 : 0,
    value: page.url.startsWith("https") ? "HTTPS" : "HTTP",
    expected: "HTTPS",
    message: isHttps ? "Le site utilise HTTPS." : "Le site n'utilise pas HTTPS. Impact critique sur le SEO.",
    priority: "HIGH",
    effort: "MEDIUM",
  })

  // Code HTTP
  const statusOk = page.statusCode === 200
  const statusWarn = [301, 302, 307, 308].includes(page.statusCode)
  results.push({
    category: "TECHNICAL",
    checkName: "http_status",
    status: statusOk ? "PASS" : statusWarn ? "WARN" : "FAIL",
    score: statusOk ? 100 : statusWarn ? 50 : 0,
    value: String(page.statusCode),
    expected: "200",
    message: statusOk
      ? "La page retourne un code 200 OK."
      : statusWarn
        ? `Redirection ${page.statusCode} détectée. Vérifier les chaînes de redirection.`
        : `Code ${page.statusCode} — page inaccessible ou en erreur.`,
    priority: statusOk ? "LOW" : "HIGH",
    effort: "LOW",
  })

  // Indexabilité
  results.push({
    category: "TECHNICAL",
    checkName: "indexability",
    status: page.isIndexable ? "PASS" : "WARN",
    score: page.isIndexable ? 100 : 0,
    value: page.metaRobots || "index, follow",
    expected: "index, follow",
    message: page.isIndexable
      ? "La page est indexable."
      : `La page est bloquée pour l'indexation (${page.metaRobots}).`,
    priority: "HIGH",
    effort: "LOW",
  })

  // Canonical
  if (page.canonicalUrl) {
    const selfCanonical = page.canonicalUrl === page.url
    results.push({
      category: "TECHNICAL",
      checkName: "canonical",
      status: selfCanonical ? "PASS" : "WARN",
      score: selfCanonical ? 100 : 50,
      value: page.canonicalUrl,
      expected: page.url,
      message: selfCanonical
        ? "Le canonical pointe sur la page elle-même."
        : `Le canonical pointe sur une URL différente : ${page.canonicalUrl}`,
      priority: "MEDIUM",
      effort: "LOW",
    })
  } else {
    results.push({
      category: "TECHNICAL",
      checkName: "canonical",
      status: "WARN",
      score: 50,
      value: "Absent",
      expected: "Présent",
      message: "Pas de balise canonical. Risque de contenu dupliqué.",
      priority: "MEDIUM",
      effort: "LOW",
    })
  }

  // Temps de réponse
  const rtMs = page.responseTime
  const rtStatus: CheckStatus = rtMs < 500 ? "PASS" : rtMs < 2000 ? "WARN" : "FAIL"
  const rtScore = rtMs < 500 ? 100 : rtMs < 1000 ? 80 : rtMs < 2000 ? 50 : 0
  results.push({
    category: "TECHNICAL",
    checkName: "response_time",
    status: rtStatus,
    score: rtScore,
    value: `${rtMs}ms`,
    expected: "< 500ms",
    message: rtStatus === "PASS"
      ? `Temps de réponse excellent : ${rtMs}ms`
      : `Temps de réponse lent : ${rtMs}ms. Impact TTFB.`,
    priority: rtStatus === "FAIL" ? "HIGH" : "MEDIUM",
    effort: "HIGH",
  })

  return results
}

// ─────────────────────────────────────────────
// ANALYSE ON-PAGE
// ─────────────────────────────────────────────

export function analyzeOnPage(page: PageData): CheckResult[] {
  const results: CheckResult[] = []

  // Title
  const titleLen = page.title?.length ?? 0
  const titleOptimal = titleLen >= 50 && titleLen <= 60
  const titlePresent = titleLen > 0
  results.push({
    category: "ON_PAGE",
    checkName: "title",
    status: titleOptimal ? "PASS" : titlePresent ? "WARN" : "FAIL",
    score: titleOptimal ? 100 : titlePresent ? 60 : 0,
    value: page.title ? `"${page.title}" (${titleLen} chars)` : "Absent",
    expected: "50-60 caractères",
    message: !titlePresent
      ? "Balise title absente. Critique pour le SEO."
      : titleOptimal
        ? `Title optimal : ${titleLen} caractères.`
        : titleLen < 50
          ? `Title trop court (${titleLen} chars). Ajouter des mots-clés.`
          : `Title trop long (${titleLen} chars). Tronqué dans les SERPs.`,
    priority: titlePresent ? (titleOptimal ? "LOW" : "MEDIUM") : "HIGH",
    effort: "LOW",
  })

  // Meta description
  const descLen = page.metaDescription?.length ?? 0
  const descOptimal = descLen >= 150 && descLen <= 160
  const descPresent = descLen > 0
  results.push({
    category: "ON_PAGE",
    checkName: "meta_description",
    status: descOptimal ? "PASS" : descPresent ? "WARN" : "FAIL",
    score: descOptimal ? 100 : descPresent ? 60 : 0,
    value: page.metaDescription ? `${descLen} caractères` : "Absente",
    expected: "150-160 caractères",
    message: !descPresent
      ? "Meta description absente. Réduit le CTR dans les SERPs."
      : descOptimal
        ? `Meta description optimale : ${descLen} caractères.`
        : descLen < 150
          ? `Meta description trop courte (${descLen} chars).`
          : `Meta description trop longue (${descLen} chars). Tronquée dans les SERPs.`,
    priority: descPresent ? "MEDIUM" : "HIGH",
    effort: "LOW",
  })

  // H1
  const h1Count = page.h1.length
  const h1Status: CheckStatus = h1Count === 1 ? "PASS" : h1Count === 0 ? "FAIL" : "WARN"
  results.push({
    category: "ON_PAGE",
    checkName: "h1",
    status: h1Status,
    score: h1Count === 1 ? 100 : h1Count === 0 ? 0 : 50,
    value: `${h1Count} H1`,
    expected: "1 H1 unique",
    message: h1Count === 1
      ? `H1 présent et unique : "${page.h1[0]}"`
      : h1Count === 0
        ? "Aucun H1 détecté. Obligatoire pour le SEO on-page."
        : `${h1Count} H1 détectés. Un seul H1 est recommandé.`,
    priority: h1Count !== 1 ? "HIGH" : "LOW",
    effort: "LOW",
  })

  // Images sans ALT
  const totalImages = page.images.length
  const imagesWithoutAlt = page.images.filter((img) => !img.hasAlt).length
  const altRatio = totalImages > 0 ? ((totalImages - imagesWithoutAlt) / totalImages) * 100 : 100
  results.push({
    category: "ON_PAGE",
    checkName: "images_alt",
    status: imagesWithoutAlt === 0 ? "PASS" : imagesWithoutAlt < 3 ? "WARN" : "FAIL",
    score: Math.round(altRatio),
    value: `${imagesWithoutAlt} images sans ALT sur ${totalImages}`,
    expected: "0 image sans ALT",
    message: imagesWithoutAlt === 0
      ? "Toutes les images ont un attribut ALT."
      : `${imagesWithoutAlt} image(s) sans attribut ALT. Impact accessibilité et SEO.`,
    priority: imagesWithoutAlt > 5 ? "HIGH" : "MEDIUM",
    effort: "LOW",
  })

  // Schema.org
  const hasSchema = page.schemaOrgTypes.length > 0
  results.push({
    category: "ON_PAGE",
    checkName: "schema_org",
    status: hasSchema ? "PASS" : "WARN",
    score: hasSchema ? 100 : 40,
    value: hasSchema ? page.schemaOrgTypes.join(", ") : "Absent",
    expected: "Présent (ex: Article, Product, LocalBusiness)",
    message: hasSchema
      ? `Schema.org détecté : ${page.schemaOrgTypes.join(", ")}`
      : "Aucune donnée structurée Schema.org. Opportunité rich snippets manquée.",
    priority: "MEDIUM",
    effort: "MEDIUM",
  })

  return results
}

// ─────────────────────────────────────────────
// ANALYSE UX/MOBILE
// ─────────────────────────────────────────────

export function analyzeUXMobile(page: PageData): CheckResult[] {
  const results: CheckResult[] = []

  // Viewport
  results.push({
    category: "UX_MOBILE",
    checkName: "viewport",
    status: page.hasViewport ? "PASS" : "FAIL",
    score: page.hasViewport ? 100 : 0,
    value: page.hasViewport ? "Présent" : "Absent",
    expected: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    message: page.hasViewport
      ? "Balise viewport présente. Page adaptée mobile."
      : "Balise viewport absente ! La page n'est pas adaptée aux mobiles.",
    priority: page.hasViewport ? "LOW" : "HIGH",
    effort: "LOW",
  })

  return results
}

// ─────────────────────────────────────────────
// ANALYSE PERFORMANCE
// ─────────────────────────────────────────────

export function analyzePerformance(page: PageData): CheckResult[] {
  const results: CheckResult[] = []

  // Temps de réponse
  const rtMs = page.responseTime
  const rtStatus: CheckStatus = rtMs < 500 ? "PASS" : rtMs < 2000 ? "WARN" : "FAIL"
  const rtScore = rtMs < 500 ? 100 : rtMs < 1000 ? 80 : rtMs < 2000 ? 50 : 0
  results.push({
    category: "PERFORMANCE",
    checkName: "response_time",
    status: rtStatus,
    score: rtScore,
    value: `${rtMs}ms`,
    expected: "< 500ms",
    message: rtStatus === "PASS"
      ? `Temps de réponse excellent : ${rtMs}ms`
      : `Temps de réponse lent : ${rtMs}ms. Impact direct sur le TTFB et l'expérience utilisateur.`,
    priority: rtStatus === "FAIL" ? "HIGH" : "MEDIUM",
    effort: "HIGH",
  })

  // Taille de la page
  const sizeKB = page.pageSize / 1024
  const sizeStatus: CheckStatus = sizeKB < 500 ? "PASS" : sizeKB < 2048 ? "WARN" : "FAIL"
  const sizeScore = sizeKB < 500 ? 100 : sizeKB < 1024 ? 70 : sizeKB < 2048 ? 40 : 0
  results.push({
    category: "PERFORMANCE",
    checkName: "page_size",
    status: sizeStatus,
    score: sizeScore,
    value: sizeKB < 1024 ? `${Math.round(sizeKB)} KB` : `${(sizeKB / 1024).toFixed(1)} MB`,
    expected: "< 500 KB",
    message: sizeStatus === "PASS"
      ? `Page légère : ${Math.round(sizeKB)} KB`
      : `Page lourde : ${sizeKB < 1024 ? Math.round(sizeKB) + " KB" : (sizeKB / 1024).toFixed(1) + " MB"}. Réduire le poids pour améliorer le chargement.`,
    priority: sizeStatus === "FAIL" ? "HIGH" : "MEDIUM",
    effort: "MEDIUM",
  })

  // Optimisation des images (ratio avec ALT)
  const totalImages = page.images.length
  if (totalImages > 0) {
    const imagesWithAlt = page.images.filter((img) => img.hasAlt).length
    const altRatio = (imagesWithAlt / totalImages) * 100
    const imgStatus: CheckStatus = altRatio > 90 ? "PASS" : altRatio > 50 ? "WARN" : "FAIL"
    results.push({
      category: "PERFORMANCE",
      checkName: "image_optimization",
      status: imgStatus,
      score: Math.round(altRatio),
      value: `${imagesWithAlt}/${totalImages} images optimisées`,
      expected: "> 90% avec attribut ALT",
      message: imgStatus === "PASS"
        ? `${Math.round(altRatio)}% des images ont un attribut ALT.`
        : `Seulement ${Math.round(altRatio)}% des images ont un ALT. Impact accessibilité et SEO images.`,
      priority: imgStatus === "FAIL" ? "HIGH" : "MEDIUM",
      effort: "LOW",
    })
  } else {
    results.push({
      category: "PERFORMANCE",
      checkName: "image_optimization",
      status: "PASS",
      score: 100,
      value: "Aucune image",
      expected: "> 90% avec attribut ALT",
      message: "Aucune image détectée sur la page.",
      priority: "LOW",
      effort: "LOW",
    })
  }

  // Liens internes
  const internalCount = page.internalLinks.length
  const internalStatus: CheckStatus = internalCount > 3 ? "PASS" : internalCount > 0 ? "WARN" : "FAIL"
  results.push({
    category: "PERFORMANCE",
    checkName: "internal_links",
    status: internalStatus,
    score: internalCount > 3 ? 100 : internalCount > 0 ? 60 : 0,
    value: `${internalCount} liens internes`,
    expected: "> 3 liens internes",
    message: internalStatus === "PASS"
      ? `Bon maillage interne : ${internalCount} liens.`
      : internalCount > 0
        ? `Seulement ${internalCount} lien(s) interne(s). Améliorer le maillage interne.`
        : "Aucun lien interne. Le maillage est essentiel pour le crawl et le PageRank.",
    priority: internalStatus === "FAIL" ? "HIGH" : "MEDIUM",
    effort: "LOW",
  })

  // Liens externes
  const externalCount = page.externalLinks.length
  const externalStatus: CheckStatus = externalCount > 0 ? "PASS" : "FAIL"
  results.push({
    category: "PERFORMANCE",
    checkName: "external_links",
    status: externalStatus,
    score: externalCount > 0 ? 100 : 30,
    value: `${externalCount} liens sortants`,
    expected: "> 0 lien sortant",
    message: externalStatus === "PASS"
      ? `${externalCount} lien(s) sortant(s) — bon signal de confiance.`
      : "Aucun lien sortant. Les liens externes renforcent la crédibilité de la page.",
    priority: "LOW",
    effort: "LOW",
  })

  // Ressources HTTPS (vérification des liens)
  const allLinks = [...page.internalLinks, ...page.externalLinks]
  if (allLinks.length > 0) {
    const httpLinks = allLinks.filter((l) => l.startsWith("http://"))
    const httpsRatio = ((allLinks.length - httpLinks.length) / allLinks.length) * 100
    const httpsStatus: CheckStatus = httpLinks.length === 0 ? "PASS" : "WARN"
    results.push({
      category: "PERFORMANCE",
      checkName: "https_resources",
      status: httpsStatus,
      score: Math.round(httpsRatio),
      value: httpLinks.length === 0 ? "100% HTTPS" : `${httpLinks.length} lien(s) HTTP`,
      expected: "100% HTTPS",
      message: httpsStatus === "PASS"
        ? "Tous les liens utilisent HTTPS."
        : `${httpLinks.length} lien(s) en HTTP détecté(s). Contenu mixte possible.`,
      priority: "MEDIUM",
      effort: "LOW",
    })
  }

  return results
}

// ─────────────────────────────────────────────
// ANALYSE PRINCIPALE
// ─────────────────────────────────────────────

export function analyzePage(page: PageData, lighthouse?: LighthouseData): AnalysisResult {
  return {
    technical: analyzeTechnical(page),
    onPage: analyzeOnPage(page),
    performance: analyzePerformance(page),
    uxMobile: analyzeUXMobile(page),
    lighthouse,
  }
}
