import type { CheerioAPI } from "cheerio"
import type { LinkingPageData } from "@seo/shared"
import { googleRobotsMeta, readGoogleRobotsRules } from "./robotsDirectives"

const cleanText = (value: string) => value.replace(/\s+/gu, " ").trim()
const excluded = "nav, header, footer, aside, script, style, noscript, iframe, object, embed, [hidden], [aria-hidden='true']"

export function resolveDocumentBaseUrl($: CheerioAPI, pageUrl: string): string {
  let baseUrl = pageUrl
  try {
    const base = new URL($("base[href]").first().attr("href") ?? pageUrl, pageUrl)
    if (["http:", "https:"].includes(base.protocol) && !base.username && !base.password) baseUrl = base.href
  } catch { /* Invalid base: use the document URL. */ }
  return baseUrl
}

export function extractLinkingData($: CheerioAPI, pageUrl: string): LinkingPageData {
  const result: LinkingPageData = { version: 1, links: [], blocks: [], linksTruncated: false, blocksTruncated: false }
  const origin = new URL(pageUrl).origin
  const baseUrl = resolveDocumentBaseUrl($, pageUrl)
  const pageNofollow = readGoogleRobotsRules(googleRobotsMeta($)).nofollow
  result.pageNofollow = pageNofollow
  $("a[href]").each((_, element) => {
    const anchor = $(element)
    if (anchor.closest("[hidden], [aria-hidden='true'], script, style, noscript, template").length) return
    try {
      const url = new URL(anchor.attr("href")!, baseUrl)
      if (url.origin !== origin || url.username || url.password || url.href.length > 2048 || !["http:", "https:"].includes(url.protocol)) return
      url.hash = ""
      if (result.links.length >= 500) { result.linksTruncated = true; return }
      const label = anchor.clone()
      label.find("script, style, noscript, iframe, object, embed, template, [hidden], [aria-hidden='true']").remove()
      const text = cleanText(label.text()) || cleanText(label.find("img[alt]").first().attr("alt") ?? "") || cleanText(anchor.attr("title") ?? "")
      result.links.push({ url: url.href, text: text.slice(0, 200), nofollow: pageNofollow || (anchor.attr("rel") ?? "").toLowerCase().split(/\s+/u).includes("nofollow"),
        placement: anchor.closest("nav, header, footer, aside").length ? "NAVIGATION" : anchor.closest("main, article, p").length ? "CONTENT" : "OTHER" })
    } catch { /* Non-HTTP and invalid links are not useful evidence. */ }
  })
  // Clone before removing unsafe/non-editorial content: other SEO checks still need the original document.
  const body = $("body").clone()
  body.find(excluded + ", template").remove()
  body.find("p").each((_, element) => {
    const paragraph = $(element)
    const text = cleanText(paragraph.text())
    if (text.length < 30) return
    if (result.blocks.length >= 30) { result.blocksTruncated = true; return }
    if (text.length > 600) result.blocksTruncated = true
    const linkedTexts = paragraph.find("a").map((_, anchor) => cleanText($(anchor).text()).slice(0, 600)).get().filter(Boolean)
    // Too many existing anchors: discard the block rather than suggesting a nested link.
    if (linkedTexts.length > 50) { result.blocksTruncated = true; return }
    const editable = paragraph.clone()
    // A separator prevents an anchor suggestion crossing an existing link, even when it covers half a word.
    editable.find("a").replaceWith("\uE000")
    const unlinkedTexts = editable.text().slice(0, 600).split("\uE000").map(cleanText).filter(Boolean)
    let remaining = 600
    const storedLinkedTexts = linkedTexts.flatMap(value => {
      if (!remaining) return []
      const clipped = value.slice(0, remaining); remaining -= clipped.length; return [clipped]
    })
    if (linkedTexts.reduce((sum, value) => sum + value.length, 0) > 600) result.blocksTruncated = true
    result.blocks.push({ text: text.slice(0, 600), linkedTexts: storedLinkedTexts, unlinkedTexts })
  })
  return result
}
