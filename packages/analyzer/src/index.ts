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

  // Lang attribute
  const langVal = page.lang
  const langValid = langVal ? /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(langVal) : false
  results.push({
    category: "TECHNICAL",
    checkName: "lang_attribute",
    status: langValid ? "PASS" : langVal ? "WARN" : "FAIL",
    score: langValid ? 100 : langVal ? 50 : 0,
    value: langVal || "Absent",
    expected: 'Attribut lang BCP 47 (ex: "fr", "en-US")',
    message: langValid
      ? `Attribut lang correct : "${langVal}".`
      : langVal
        ? `Attribut lang présent mais format suspect : "${langVal}".`
        : "Attribut lang absent sur la balise <html>. Important pour le SEO international.",
    priority: langVal ? "LOW" : "MEDIUM",
    effort: "LOW",
  })

  // robots.txt
  if (page.hasRobotsTxt !== undefined) {
    results.push({
      category: "TECHNICAL",
      checkName: "robots_txt",
      status: page.hasRobotsTxt ? "PASS" : "WARN",
      score: page.hasRobotsTxt ? 100 : 30,
      value: page.hasRobotsTxt ? "Accessible" : "Absent ou vide",
      expected: "Fichier robots.txt accessible",
      message: page.hasRobotsTxt
        ? "Le fichier robots.txt est accessible."
        : "Fichier robots.txt absent ou vide. Les moteurs de recherche ne connaissent pas vos règles de crawl.",
      priority: "MEDIUM",
      effort: "LOW",
    })
  }

  // sitemap.xml
  if (page.hasSitemap !== undefined) {
    results.push({
      category: "TECHNICAL",
      checkName: "sitemap",
      status: page.hasSitemap ? "PASS" : "WARN",
      score: page.hasSitemap ? 100 : 30,
      value: page.hasSitemap ? "Accessible" : "Absent",
      expected: "Fichier sitemap.xml accessible",
      message: page.hasSitemap
        ? "Le sitemap XML est accessible."
        : "Sitemap XML absent. Soumettez-en un pour faciliter l'indexation.",
      priority: "MEDIUM",
      effort: "LOW",
    })
  }

  // Hreflang (international SEO)
  const hreflangCount = page.hreflangTags?.length ?? 0
  if (hreflangCount > 0) {
    const hasSelfRef = page.hreflangTags!.some((t) => t.href === page.url || t.lang === "x-default")
    results.push({
      category: "TECHNICAL",
      checkName: "hreflang",
      status: hasSelfRef ? "PASS" : "WARN",
      score: hasSelfRef ? 100 : 60,
      value: `${hreflangCount} balise(s) hreflang`,
      expected: "Hreflang avec auto-référence",
      message: hasSelfRef
        ? `${hreflangCount} balise(s) hreflang correctement configurée(s).`
        : `${hreflangCount} balise(s) hreflang détectée(s) mais pas d'auto-référence. Ajoutez hreflang pour la page elle-même.`,
      priority: "MEDIUM",
      effort: "LOW",
    })
  }

  // Security headers
  if (page.responseHeaders) {
    const headers = page.responseHeaders
    const secHeaders = [
      { key: "strict-transport-security", label: "HSTS" },
      { key: "x-content-type-options", label: "X-Content-Type-Options" },
      { key: "x-frame-options", label: "X-Frame-Options" },
    ]
    const present = secHeaders.filter((h) => headers[h.key])
    const score = Math.round((present.length / secHeaders.length) * 100)
    results.push({
      category: "TECHNICAL",
      checkName: "security_headers",
      status: present.length === secHeaders.length ? "PASS" : present.length > 0 ? "WARN" : "FAIL",
      score,
      value: present.length > 0 ? present.map((h) => h.label).join(", ") : "Aucun",
      expected: "HSTS + X-Content-Type-Options + X-Frame-Options",
      message: present.length === secHeaders.length
        ? "Tous les headers de sécurité essentiels sont présents."
        : `${present.length}/${secHeaders.length} headers de sécurité. Manquant : ${secHeaders.filter((h) => !headers[h.key]).map((h) => h.label).join(", ")}.`,
      priority: present.length === 0 ? "HIGH" : "MEDIUM",
      effort: "LOW",
    })
  }

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

  // Open Graph
  const og = page.ogTags
  const ogFields = [og?.title, og?.description, og?.image].filter(Boolean).length
  const ogScore = Math.round((ogFields / 3) * 100)
  results.push({
    category: "ON_PAGE",
    checkName: "open_graph",
    status: ogFields === 3 ? "PASS" : ogFields > 0 ? "WARN" : "FAIL",
    score: ogScore,
    value: `${ogFields}/3 balises OG (title, description, image)`,
    expected: "og:title + og:description + og:image",
    message: ogFields === 3
      ? "Toutes les balises Open Graph principales sont présentes."
      : ogFields > 0
        ? `Open Graph incomplet : ${ogFields}/3 balises présentes. Complétez pour un meilleur partage social.`
        : "Aucune balise Open Graph. Le partage sur les réseaux sociaux sera mal optimisé.",
    priority: ogFields === 0 ? "MEDIUM" : "LOW",
    effort: "LOW",
  })

  // Heading hierarchy
  const h2Count = page.headings.h2.length
  const h3Count = page.headings.h3.length
  const h4Count = page.headings.h4?.length ?? 0
  const h1Count2 = page.h1.length
  const hierarchyOk = h1Count2 >= 1 && (h3Count === 0 || h2Count > 0) && (h4Count === 0 || h3Count > 0)
  results.push({
    category: "ON_PAGE",
    checkName: "heading_hierarchy",
    status: hierarchyOk ? "PASS" : "WARN",
    score: hierarchyOk ? 100 : 40,
    value: `H1:${h1Count2} H2:${h2Count} H3:${h3Count} H4:${h4Count}`,
    expected: "H1 > H2 > H3 > H4 (hiérarchie logique)",
    message: hierarchyOk
      ? "La hiérarchie des titres est logique et bien structurée."
      : "La hiérarchie des titres est incohérente (ex: H3 sans H2). Restructurez vos titres.",
    priority: "MEDIUM",
    effort: "LOW",
  })

  // Word count
  const wc = page.wordCount ?? 0
  const wcStatus: CheckStatus = wc >= 300 ? "PASS" : wc >= 100 ? "WARN" : "FAIL"
  const wcScore = wc >= 300 ? 100 : wc >= 100 ? 60 : wc > 0 ? 20 : 0
  results.push({
    category: "ON_PAGE",
    checkName: "word_count",
    status: wcStatus,
    score: wcScore,
    value: `${wc} mots`,
    expected: "≥ 300 mots",
    message: wcStatus === "PASS"
      ? `Contenu suffisant : ${wc} mots.`
      : wc >= 100
        ? `Contenu léger : ${wc} mots. Visez au moins 300 mots pour un bon positionnement.`
        : `Contenu très insuffisant : ${wc} mots. Les pages thin content sont pénalisées.`,
    priority: wcStatus === "FAIL" ? "HIGH" : "MEDIUM",
    effort: "MEDIUM",
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

  // Twitter Cards
  const tc = page.twitterCard
  const tcFields = [tc?.card, tc?.title, tc?.description].filter(Boolean).length
  const tcScore = Math.round((tcFields / 3) * 100)
  results.push({
    category: "ON_PAGE",
    checkName: "twitter_cards",
    status: tcFields === 3 ? "PASS" : tcFields > 0 ? "WARN" : "FAIL",
    score: tcScore,
    value: `${tcFields}/3 balises Twitter Card`,
    expected: "twitter:card + twitter:title + twitter:description",
    message: tcFields === 3
      ? "Toutes les balises Twitter Card sont présentes."
      : tcFields > 0
        ? `Twitter Cards incomplet : ${tcFields}/3 balises. Complétez pour un meilleur partage sur X/Twitter.`
        : "Aucune balise Twitter Card. Le partage sur X/Twitter sera mal optimisé.",
    priority: tcFields === 0 ? "MEDIUM" : "LOW",
    effort: "LOW",
  })

  // Keyword density (basé sur les top keywords extraits)
  if (page.topKeywords && page.topKeywords.length > 0 && page.wordCount && page.wordCount > 0) {
    const topKw = page.topKeywords[0]
    const density = (topKw.count / page.wordCount) * 100
    const densityOk = density >= 0.5 && density <= 3
    const tooHigh = density > 3
    results.push({
      category: "ON_PAGE",
      checkName: "keyword_density",
      status: densityOk ? "PASS" : tooHigh ? "WARN" : "WARN",
      score: densityOk ? 100 : tooHigh ? 40 : 60,
      value: `"${topKw.term}" : ${density.toFixed(1)}% (${topKw.count}x sur ${page.wordCount} mots)`,
      expected: "0.5% — 3% pour le mot-clé principal",
      message: densityOk
        ? `Densité du mot-clé principal "${topKw.term}" optimale : ${density.toFixed(1)}%.`
        : tooHigh
          ? `Densité trop élevée pour "${topKw.term}" (${density.toFixed(1)}%). Risque de keyword stuffing.`
          : `Densité faible pour "${topKw.term}" (${density.toFixed(1)}%). Augmentez les occurrences naturelles.`,
      priority: tooHigh ? "MEDIUM" : "LOW",
      effort: "LOW",
    })
  }

  // Content readability (Flesch-Kincaid adapté français)
  if (page.bodyText && page.wordCount && page.wordCount >= 100) {
    const sentences = page.bodyText.split(/[.!?]+/).filter((s) => s.trim().length > 0).length
    const words = page.wordCount
    const syllables = estimateSyllablesFr(page.bodyText)
    // Formule Flesch adaptée FR : 207 - 1.015 * (words/sentences) - 73.6 * (syllables/words)
    const avgWordsPerSentence = sentences > 0 ? words / sentences : words
    const avgSyllablesPerWord = words > 0 ? syllables / words : 2
    const fleschFr = Math.max(0, Math.min(100, 207 - 1.015 * avgWordsPerSentence - 73.6 * avgSyllablesPerWord))
    const readScore = Math.round(fleschFr)
    const readStatus: CheckStatus = readScore >= 60 ? "PASS" : readScore >= 30 ? "WARN" : "FAIL"
    results.push({
      category: "ON_PAGE",
      checkName: "content_readability",
      status: readStatus,
      score: readScore,
      value: `Score Flesch : ${readScore}/100`,
      expected: "> 60 (facile à lire)",
      message: readScore >= 60
        ? `Contenu facile à lire (score ${readScore}/100).`
        : readScore >= 30
          ? `Contenu assez difficile à lire (score ${readScore}/100). Simplifiez les phrases.`
          : `Contenu très difficile à lire (score ${readScore}/100). Phrases trop longues ou vocabulaire complexe.`,
      priority: readStatus === "FAIL" ? "MEDIUM" : "LOW",
      effort: "MEDIUM",
    })
  }

  return results
}

// Estimation du nombre de syllabes en français (heuristique)
function estimateSyllablesFr(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0)
  let total = 0
  for (const word of words) {
    // Compter les groupes de voyelles (approximation FR)
    const vowelGroups = word.match(/[aeiouyàâäéèêëïîôùûüœæ]+/gi)
    let count = vowelGroups ? vowelGroups.length : 1
    // Le "e" muet en fin de mot ne compte pas
    if (word.endsWith("e") && count > 1) count--
    if (word.endsWith("es") && count > 1) count--
    if (word.endsWith("ent") && count > 1 && word.length > 4) count--
    total += Math.max(1, count)
  }
  return total
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

  // Mobile-friendly (responsive meta check)
  const hasResponsive = page.hasResponsiveMeta ?? page.hasViewport
  results.push({
    category: "UX_MOBILE",
    checkName: "mobile_friendly",
    status: hasResponsive ? "PASS" : "FAIL",
    score: hasResponsive ? 100 : 0,
    value: hasResponsive ? "Responsive" : "Non responsive",
    expected: "width=device-width dans viewport",
    message: hasResponsive
      ? "La page utilise un viewport responsive (width=device-width)."
      : "La page n'a pas de viewport responsive. L'affichage mobile sera dégradé.",
    priority: hasResponsive ? "LOW" : "HIGH",
    effort: "LOW",
  })

  // Tap targets
  const smallTaps = page.smallTapTargets ?? 0
  const tapStatus: CheckStatus = smallTaps === 0 ? "PASS" : smallTaps <= 5 ? "WARN" : "FAIL"
  results.push({
    category: "UX_MOBILE",
    checkName: "tap_targets",
    status: tapStatus,
    score: smallTaps === 0 ? 100 : smallTaps <= 3 ? 70 : smallTaps <= 10 ? 40 : 0,
    value: `${smallTaps} élément(s) < 44px`,
    expected: "0 élément cliquable < 44×44px",
    message: tapStatus === "PASS"
      ? "Toutes les cibles tactiles ont une taille suffisante."
      : `${smallTaps} élément(s) cliquable(s) trop petit(s) (< 44px). Difficile à toucher sur mobile.`,
    priority: tapStatus === "FAIL" ? "HIGH" : "MEDIUM",
    effort: "LOW",
  })

  // Font size
  const smallFonts = page.smallFontSizes ?? 0
  const fontStatus: CheckStatus = smallFonts === 0 ? "PASS" : smallFonts <= 5 ? "WARN" : "FAIL"
  results.push({
    category: "UX_MOBILE",
    checkName: "font_size",
    status: fontStatus,
    score: smallFonts === 0 ? 100 : smallFonts <= 3 ? 70 : smallFonts <= 10 ? 40 : 0,
    value: `${smallFonts} élément(s) < 12px`,
    expected: "0 texte avec font-size < 12px",
    message: fontStatus === "PASS"
      ? "Toutes les tailles de police sont lisibles."
      : `${smallFonts} élément(s) avec une police trop petite (< 12px). Difficile à lire sur mobile.`,
    priority: fontStatus === "FAIL" ? "MEDIUM" : "LOW",
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

  // Image lazy loading
  const totalImgs = page.images.length
  if (totalImgs > 1) {
    const lazyCount = page.imagesLazyCount ?? 0
    // La première image ne devrait PAS être lazy (LCP), les autres oui
    const expectedLazy = totalImgs - 1
    const lazyRatio = expectedLazy > 0 ? (lazyCount / expectedLazy) * 100 : 100
    const lazyStatus: CheckStatus = lazyRatio >= 80 ? "PASS" : lazyRatio >= 50 ? "WARN" : "FAIL"
    results.push({
      category: "PERFORMANCE",
      checkName: "image_lazy_loading",
      status: lazyStatus,
      score: Math.round(lazyRatio),
      value: `${lazyCount}/${totalImgs} images en lazy loading`,
      expected: "Images below the fold en loading='lazy'",
      message: lazyStatus === "PASS"
        ? `${lazyCount} image(s) sur ${totalImgs} utilisent le lazy loading.`
        : `Seulement ${lazyCount}/${totalImgs} images utilisent loading="lazy". Ajoutez-le aux images hors viewport initial.`,
      priority: lazyStatus === "FAIL" ? "MEDIUM" : "LOW",
      effort: "LOW",
    })
  }

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
