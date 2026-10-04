import * as cheerio from "cheerio"
import { plainCmsText } from "./cmsText"
export interface ObservedRank { position: number | null; url: string | null; title: string | null; resultCount: number }
export function parseGoogleRankHtml(html: string, targetDomain: string): ObservedRank {
  const $ = cheerio.load(html), target = new URL(targetDomain.includes("://") ? targetDomain : "https://" + targetDomain).hostname.toLowerCase().replace(/^www\./, "")
  if ($('form[action*="sorry"], #captcha, #recaptcha').length) throw new Error("Google response blocked")
  const seen = new Set<string>(); let found: Omit<ObservedRank, "resultCount"> | null = null
  $("#rso h3, #search h3").each((_index, heading) => {
    const node = $(heading)
    if (node.closest('[data-text-ad], [data-pla], #tads, #bottomads').length) return
    const href = node.closest("a").attr("href")
    if (!href || !/^https?:\/\//i.test(href)) return
    try {
      const url = new URL(href), host = url.hostname.toLowerCase().replace(/^www\./, "")
      if (/^(?:[^.]+\.)?google\.[a-z.]+$/.test(host) || url.username || url.password || seen.has(url.href) || seen.size >= 100) return
      seen.add(url.href)
      if (!found && (host === target || host.endsWith("." + target))) found = { position: seen.size, url: url.href, title: plainCmsText(node.text(), 500) }
    } catch { /* An invalid outbound link is not an organic result. */ }
  })
  if (!seen.size) throw new Error("Google response contains no verifiable organic results")
  return { ...(found ?? { position: null, url: null, title: null }), resultCount: seen.size }
}
