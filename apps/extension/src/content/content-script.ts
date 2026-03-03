// content/content-script.ts — Analyse locale instantanée de la page

interface LocalSEOData {
  url: string
  title: string | null
  titleLength: number
  metaDescription: string | null
  metaDescLength: number
  h1Count: number
  h1Text: string[]
  hasViewport: boolean
  canonicalUrl: string | null
  isHttps: boolean
  metaRobots: string | null
  schemaTypes: string[]
  imagesWithoutAlt: number
  totalImages: number
  hasOpenGraph: boolean
  hasTwitterCard: boolean
}

interface QuickIssue {
  label: string
  status: "pass" | "warn" | "fail"
  detail: string
}

export interface PageAnalysisResponse {
  data: LocalSEOData
  score: number
  issues: QuickIssue[]
}

// ─────────────────────────────────────────────
// ANALYSE LOCALE
// ─────────────────────────────────────────────

function analyzeCurrentPage(): LocalSEOData {
  const doc = document
  const url = window.location.href
  const isHttps = url.startsWith("https://")

  const title = doc.title || null
  const titleLength = title?.length ?? 0

  const metaDescEl = doc.querySelector<HTMLMetaElement>('meta[name="description"]')
  const metaDescription = metaDescEl?.content || null
  const metaDescLength = metaDescription?.length ?? 0

  const h1Els = doc.querySelectorAll("h1")
  const h1Count = h1Els.length
  const h1Text = Array.from(h1Els).map((el) => el.textContent?.trim() ?? "")

  const viewportEl = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  const hasViewport = !!viewportEl

  const canonicalEl = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  const canonicalUrl = canonicalEl?.href || null

  const robotsEl = doc.querySelector<HTMLMetaElement>('meta[name="robots"]')
  const metaRobots = robotsEl?.content || null

  const schemaEls = doc.querySelectorAll('script[type="application/ld+json"]')
  const schemaTypes: string[] = []
  schemaEls.forEach((el) => {
    try {
      const json = JSON.parse(el.textContent ?? "") as Record<string, unknown>
      const type = json["@type"]
      if (type) schemaTypes.push(Array.isArray(type) ? (type as string[]).join(", ") : String(type))
    } catch { /* skip */ }
  })

  const imgEls = doc.querySelectorAll("img")
  const totalImages = imgEls.length
  const imagesWithoutAlt = Array.from(imgEls).filter(
    (img) => !img.alt || img.alt.trim() === ""
  ).length

  const hasOpenGraph = !!doc.querySelector('meta[property="og:title"]')
  const hasTwitterCard = !!doc.querySelector('meta[name="twitter:card"]')

  return {
    url, title, titleLength, metaDescription, metaDescLength,
    h1Count, h1Text, hasViewport, canonicalUrl, isHttps,
    metaRobots, schemaTypes, imagesWithoutAlt, totalImages,
    hasOpenGraph, hasTwitterCard,
  }
}

// ─────────────────────────────────────────────
// SCORING RAPIDE
// ─────────────────────────────────────────────

function computeQuickScore(data: LocalSEOData): { score: number; issues: QuickIssue[] } {
  const issues: QuickIssue[] = []
  let score = 100

  if (!data.isHttps) {
    score -= 15
    issues.push({ label: "HTTPS", status: "fail", detail: "Site non sécurisé (HTTP)" })
  } else {
    issues.push({ label: "HTTPS", status: "pass", detail: "Site sécurisé" })
  }

  if (!data.title) {
    score -= 15
    issues.push({ label: "Title", status: "fail", detail: "Balise title absente" })
  } else if (data.titleLength < 50 || data.titleLength > 60) {
    score -= 5
    issues.push({ label: "Title", status: "warn", detail: `${data.titleLength} chars (optimal: 50-60)` })
  } else {
    issues.push({ label: "Title", status: "pass", detail: `${data.titleLength} chars` })
  }

  if (!data.metaDescription) {
    score -= 10
    issues.push({ label: "Meta description", status: "fail", detail: "Absente" })
  } else if (data.metaDescLength < 150 || data.metaDescLength > 160) {
    score -= 5
    issues.push({ label: "Meta description", status: "warn", detail: `${data.metaDescLength} chars (optimal: 150-160)` })
  } else {
    issues.push({ label: "Meta description", status: "pass", detail: `${data.metaDescLength} chars` })
  }

  if (data.h1Count === 0) {
    score -= 12
    issues.push({ label: "H1", status: "fail", detail: "Aucun H1 trouvé" })
  } else if (data.h1Count > 1) {
    score -= 5
    issues.push({ label: "H1", status: "warn", detail: `${data.h1Count} H1 détectés (1 recommandé)` })
  } else {
    issues.push({ label: "H1", status: "pass", detail: `"${data.h1Text[0]?.substring(0, 50)}"` })
  }

  if (!data.hasViewport) {
    score -= 10
    issues.push({ label: "Viewport", status: "fail", detail: "Balise viewport manquante" })
  } else {
    issues.push({ label: "Viewport", status: "pass", detail: "Présent" })
  }

  if (data.imagesWithoutAlt > 0) {
    const deduct = Math.min(data.imagesWithoutAlt * 2, 10)
    score -= deduct
    issues.push({
      label: "Images ALT",
      status: data.imagesWithoutAlt > 5 ? "fail" : "warn",
      detail: `${data.imagesWithoutAlt} image(s) sans ALT sur ${data.totalImages}`,
    })
  } else if (data.totalImages > 0) {
    issues.push({ label: "Images ALT", status: "pass", detail: `Toutes les ${data.totalImages} images ont un ALT` })
  }

  if (!data.hasOpenGraph) {
    score -= 5
    issues.push({ label: "Open Graph", status: "warn", detail: "Tags OG absents (partage réseaux sociaux)" })
  } else {
    issues.push({ label: "Open Graph", status: "pass", detail: "Tags OG présents" })
  }

  if (data.schemaTypes.length === 0) {
    score -= 5
    issues.push({ label: "Schema.org", status: "warn", detail: "Aucune donnée structurée" })
  } else {
    issues.push({ label: "Schema.org", status: "pass", detail: data.schemaTypes.join(", ") })
  }

  return { score: Math.max(0, score), issues }
}

// ─────────────────────────────────────────────
// MESSAGE LISTENER
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_DATA") {
    const data = analyzeCurrentPage()
    const { score, issues } = computeQuickScore(data)
    sendResponse({ data, score, issues } satisfies PageAnalysisResponse)
  }
  return true
})
