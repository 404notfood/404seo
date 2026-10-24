// PDF generation stays isolated from presentation and preserves the network sandbox.
import puppeteer from "puppeteer"
import { fetchPublicUrl } from "@seo/shared/security"
import type { SEOScore, Recommendation } from "@seo/scorer"
import type { AuditCheckOccurrence, SiteKeywordEntry } from "@seo/shared"
import { generateReportHTML, escapeReportHtml } from "./reportTemplate"

export interface ReportData {
  url: string
  date: string
  score: SEOScore
  recommendations: Recommendation[]
  checks?: AuditCheckOccurrence[]
  totalPages?: number
  keywords?: { keywords: SiteKeywordEntry[]; totalPages: number }
  tenantBranding?: { name?: string; logoUrl?: string; brandColor?: string }
}

export { generateReportHTML } from "./reportTemplate"

let activePdfJobs = 0
export async function generatePDF(data: ReportData): Promise<Buffer> {
  const html = generateReportHTML(data)
  if (activePdfJobs >= 2) throw Object.assign(new Error("Génération PDF occupée, réessayer"), { statusCode: 503 })
  activePdfJobs++
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>> | null = null
  try {
    browser = await puppeteer.launch({
      headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, args: ["--disable-dev-shm-usage"],
    })
    page = await browser.newPage()
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on("request", async (request) => {
      if (request.resourceType() !== "image" || request.url() !== data.tenantBranding?.logoUrl) {
        await request.abort().catch(() => {}); return
      }
      try {
        const response = await fetchPublicUrl(request.url(), { maxBytes: 2 * 1024 * 1024, timeoutMs: 5000 })
        const contentType = response.headers["content-type"]?.split(";")[0]
        if (!response.ok || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(contentType)) {
          await request.abort(); return
        }
        await request.respond({ status: 200, contentType, body: response.body })
      } catch { await request.abort().catch(() => {}) }
    })
    // Le HTML est statique (pas de réseau externe attendu) ; un timeout borné
    // évite que networkidle0 ne bloque si une ressource distante traîne.
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 })

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "16mm", bottom: "18mm", left: "16mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Arial,sans-serif;font-size:8px;color:#64748b;display:flex;justify-content:space-between;gap:12px"><span>${escapeReportHtml(data.tenantBranding?.name ?? "404 SEO")}</span><span>${escapeReportHtml(new URL(data.url).hostname)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    })

    return Buffer.from(pdf)
  } finally {
    if (page) await page.close().catch(() => {})
    await browser?.close().catch(() => {})
    activePdfJobs--
  }
}
