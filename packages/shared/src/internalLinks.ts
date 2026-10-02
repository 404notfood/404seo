import type { InternalLinkAnalysis, InternalLinkPageInput, InternalLinkSuggestion, LinkingPageData } from "./types/internalLinks.types"

export const INTERNAL_LINK_LIMITS = { pages: 1000, edges: 100_000, suggestions: 500, candidatesPerSource: 60, anchors: 500, blocks: 30, comparisons: 20_000 } as const
const stopWords = new Set("avec dans pour sans sur une des les aux par du de la le un et ou qui que est sont votre vos vous nous notre nos ce ces cette cet son ses sa au il elle ils elles en a se the and for with from this that these those your our you are was were has have into about not sur plus tout tous comment guide conseils article page home accueil".split(" "))
const folded = (value: string) => value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
const tokens = (value: string) => [...value.matchAll(/[\p{L}\p{N}]+/gu)].map(match => ({ text: match[0], word: folded(match[0]), start: match.index, end: match.index + match[0].length }))
const useful = (word: string) => word.length >= 3 && !stopWords.has(word) && /\p{L}/u.test(word)
const terms = (value: string) => new Set(tokens(value).map(token => token.word).filter(useful))
const genericAnchors = new Set(["ici", "cliquez ici", "en savoir plus", "lire la suite", "voir plus", "click here", "read more", "learn more", "plus d informations"])
export const isGenericInternalAnchor = (text: string) => genericAnchors.has(tokens(text).map(token => token.word).join(" "))

/** Fragments do not identify a separate document. Query parameters and trailing slashes do. */
export function normalizeInternalLinkUrl(value: string, base?: string): string | null {
  if (value.length > 2048) return null
  try {
    const url = new URL(value, base)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null
    url.hash = ""
    return url.href
  } catch { return null }
}

function inProject(value: string, projectUrl: string): boolean {
  try {
    const url = new URL(value), project = new URL(projectUrl)
    const prefix = project.pathname.endsWith("/") ? project.pathname : `${project.pathname}/`
    return url.origin === project.origin && (project.pathname === "/" || url.pathname === project.pathname || url.pathname.startsWith(prefix))
  } catch { return false }
}

export { inProject as internalLinkBelongsToProject }

export function readLinkingData(value: unknown): LinkingPageData | null {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  if (data.version !== 1 || !Array.isArray(data.links) || !Array.isArray(data.blocks)) return null
  const links: LinkingPageData["links"] = []
  const blocks: LinkingPageData["blocks"] = []
  let malformed = false
  for (const raw of data.links.slice(0, INTERNAL_LINK_LIMITS.anchors)) {
    if (!raw || typeof raw !== "object") { malformed = true; continue }
    const link = raw as Record<string, unknown>
    if (typeof link.url !== "string" || typeof link.text !== "string" || link.text.length > 200 || typeof link.nofollow !== "boolean"
      || !["CONTENT", "NAVIGATION", "OTHER"].includes(String(link.placement))) { malformed = true; continue }
    const url = normalizeInternalLinkUrl(link.url)
    if (!url) { malformed = true; continue }
    links.push({ url, text: link.text, nofollow: link.nofollow, placement: link.placement as "CONTENT" | "NAVIGATION" | "OTHER" })
  }
  for (const raw of data.blocks.slice(0, INTERNAL_LINK_LIMITS.blocks)) {
    if (!raw || typeof raw !== "object") { malformed = true; continue }
    const block = raw as Record<string, unknown>
    if (typeof block.text !== "string" || block.text.length > 600 || !Array.isArray(block.linkedTexts) || block.linkedTexts.length > 50
      || !block.linkedTexts.every(text => typeof text === "string" && text.length <= 600)) { malformed = true; continue }
    if (block.unlinkedTexts !== undefined && (!Array.isArray(block.unlinkedTexts) || block.unlinkedTexts.length > 51 || !block.unlinkedTexts.every(text => typeof text === "string" && text.length <= 600))) { malformed = true; continue }
    blocks.push({ text: block.text, linkedTexts: block.linkedTexts as string[], ...(block.unlinkedTexts ? { unlinkedTexts: block.unlinkedTexts as string[] } : {}) })
  }
  return { version: 1, links, blocks, linksTruncated: malformed || data.linksTruncated !== false || data.links.length > INTERNAL_LINK_LIMITS.anchors,
    blocksTruncated: malformed || data.blocksTruncated !== false || data.blocks.length > INTERNAL_LINK_LIMITS.blocks, pageNofollow: data.pageNofollow === true }
}

function exclusion(page: InternalLinkPageInput, url: string): string | null {
  if (page.statusCode !== 200) return "Réponse HTTP différente de 200 ou inconnue"
  if (page.redirectUrl) return "Page obtenue après redirection"
  if (page.isIndexable !== true) return "Page non indexable ou indexabilité inconnue"
  if (page.canonicalUrl && normalizeInternalLinkUrl(page.canonicalUrl, url) !== url) return "Canonique différente ou invalide"
  return null
}

function literalAnchor(block: LinkingPageData["blocks"][number], targetTerms: Set<string>): { anchor: string; matched: string[] } | null {
  // Legacy evidence without editable ranges is insufficient when the paragraph already contains links.
  if (!block.unlinkedTexts && block.linkedTexts.length) return null
  let best: { anchor: string; matched: string[] } | null = null
  for (const text of block.unlinkedTexts ?? [block.text]) {
    const match = anchorInText(text, targetTerms)
    if (match && block.text.includes(match.anchor) && (!best || match.matched.length > best.matched.length || match.matched.length === best.matched.length && match.anchor.length < best.anchor.length)) best = match
  }
  return best
}

function anchorInText(text: string, targetTerms: Set<string>): { anchor: string; matched: string[] } | null {
  const words = tokens(text)
  let best: { anchor: string; matched: string[] } | null = null
  for (let start = 0; start < words.length; start++) {
    if (!targetTerms.has(words[start].word)) continue
    for (let end = start + 1; end < Math.min(start + 5, words.length); end++) {
      if (!targetTerms.has(words[end].word)) continue
      const matched = [...new Set(words.slice(start, end + 1).map(word => word.word).filter(word => targetTerms.has(word)))]
      const anchor = text.slice(words[start].start, words[end].end)
      if (matched.length < 2 || anchor.length > 100 || /[.!?;:]/u.test(anchor)) continue
      if (!best || matched.length > best.matched.length || matched.length === best.matched.length && anchor.length < best.anchor.length) best = { anchor, matched }
    }
  }
  return best
}

export function buildInternalLinkAnalysis(input: InternalLinkPageInput[], projectUrl: string, entryUrl = projectUrl): InternalLinkAnalysis {
  const result: InternalLinkAnalysis = { nodes: [], suggestions: [], anchorIssues: [], summary: { pages: 0, edges: 0, withoutIncoming: 0, unreachable: 0, unknownTargets: 0, contextualPages: 0, anchorIssues: 0 },
    limits: { pages: input.length > INTERNAL_LINK_LIMITS.pages, links: false, content: false, suggestions: false } }
  const pages = new Map<string, InternalLinkPageInput>()
  for (const page of input.slice(0, INTERNAL_LINK_LIMITS.pages)) {
    const url = normalizeInternalLinkUrl(page.url)
    if (url && inProject(url, projectUrl) && !pages.has(url)) pages.set(url, page)
  }
  const data = new Map([...pages].map(([url, page]) => [url, readLinkingData(page.linkingData)]))
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()
  const unknown = new Set<string>()
  let edgeCount = 0
  for (const [url, page] of pages) {
    const evidence = data.get(url)
    if (evidence) result.summary.contextualPages++
    result.limits.links ||= !!evidence?.linksTruncated || (page.internalLinks ?? 0) > page.internalLinkUrls.length || page.internalLinkUrls.length > 500
    result.limits.content ||= !!evidence?.blocksTruncated
    const edges = new Set<string>()
    outgoing.set(url, edges)
    // Historical audits contain only URLs. New evidence supplements them, including correctly resolved <base> links.
    for (const raw of [...page.internalLinkUrls.slice(0, 500), ...(evidence?.links.map(link => link.url) ?? [])]) {
      const target = normalizeInternalLinkUrl(raw, page.redirectUrl ?? url)
      if (!target || target === url || !inProject(target, projectUrl) || edges.has(target)) continue
      if (edgeCount >= INTERNAL_LINK_LIMITS.edges) { result.limits.links = true; break }
      edges.add(target); edgeCount++
      if (!pages.has(target)) unknown.add(target)
      else { const sources = incoming.get(target) ?? new Set<string>(); sources.add(url); incoming.set(target, sources) }
    }
    for (const link of evidence?.links ?? []) {
      if (link.url === url || !inProject(link.url, projectUrl)) continue
      const reason = link.nofollow ? "NOFOLLOW" : !link.text.trim() ? "EMPTY" : isGenericInternalAnchor(link.text) ? "GENERIC" : null
      if (reason) {
        result.summary.anchorIssues++
        if (result.anchorIssues.length < 500) result.anchorIssues.push({ sourceUrl: url, targetUrl: link.url, anchor: link.text, reason })
      }
    }
  }
  const depths = new Map<string, number>()
  const entry = normalizeInternalLinkUrl(entryUrl)
  if (entry && pages.has(entry)) {
    const queue = [entry]; depths.set(entry, 0)
    for (let index = 0; index < queue.length; index++) {
      for (const target of outgoing.get(queue[index]) ?? []) {
        if (!pages.has(target) || depths.has(target)) continue
        depths.set(target, depths.get(queue[index])! + 1); queue.push(target)
      }
    }
  }
  result.nodes = [...pages].map(([url, page]) => ({ url, title: (page.title ?? page.h1[0] ?? url).slice(0, 300), incoming: incoming.get(url)?.size ?? 0,
    outgoing: outgoing.get(url)?.size ?? 0, depth: depths.get(url) ?? null, eligible: exclusion(page, url) === null, exclusion: exclusion(page, url) }))
  const nodes = new Map(result.nodes.map(node => [node.url, node]))
  const targetTerms = new Map<string, Set<string>>()
  const postings = new Map<string, string[]>()
  for (const [url, page] of pages) {
    if (!nodes.get(url)?.eligible) continue
    const words = terms(`${page.title?.slice(0, 300) ?? ""} ${page.h1.slice(0, 3).map(text => text.slice(0, 300)).join(" ")}`)
    targetTerms.set(url, words)
    for (const word of words) { const list = postings.get(word) ?? []; list.push(url); postings.set(word, list) }
  }
  let comparisons = 0
  for (const [sourceUrl, page] of pages) {
    const evidence = data.get(sourceUrl)
    if (!nodes.get(sourceUrl)?.eligible || !evidence?.blocks.length || evidence.linksTruncated || evidence.pageNofollow || (page.internalLinks ?? 0) > 500) continue
    if (comparisons >= INTERNAL_LINK_LIMITS.comparisons) { result.limits.suggestions = true; break }
    const candidates = new Map<string, number>()
    const sourceTerms = terms(evidence.blocks.map(block => block.text).join(" "))
    for (const word of sourceTerms) {
      const targets = postings.get(word) ?? []
      // Very common vocabulary does not establish a specific topical relationship.
      if (pages.size >= 5 && targets.length > pages.size * 0.6) continue
      for (const target of targets) candidates.set(target, (candidates.get(target) ?? 0) + 1)
    }
    const ranked = [...candidates].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    if (ranked.length > INTERNAL_LINK_LIMITS.candidatesPerSource) result.limits.suggestions = true
    const proposals: InternalLinkSuggestion[] = []
    const observedTargets = new Set([...page.internalLinkUrls.slice(0, 500), ...evidence.links.map(link => link.url)].map(raw => normalizeInternalLinkUrl(raw, page.redirectUrl ?? sourceUrl)).filter((url): url is string => !!url))
    for (const [targetUrl] of ranked.slice(0, INTERNAL_LINK_LIMITS.candidatesPerSource)) {
      if (sourceUrl === targetUrl || observedTargets.has(targetUrl)) continue
      const targetPage = pages.get(targetUrl)!
      if (page.lang && targetPage.lang && page.lang.toLowerCase().split("-")[0] !== targetPage.lang.toLowerCase().split("-")[0]) continue
      let best: InternalLinkSuggestion | null = null
      for (const block of evidence.blocks) {
        if (comparisons++ >= INTERNAL_LINK_LIMITS.comparisons) { result.limits.suggestions = true; break }
        const match = literalAnchor(block, targetTerms.get(targetUrl)!)
        if (!match) continue
        if (!best || match.matched.length > best.matchedTerms.length) best = { sourceUrl, sourceTitle: nodes.get(sourceUrl)!.title, targetUrl, targetTitle: nodes.get(targetUrl)!.title,
          anchor: match.anchor, excerpt: block.text, matchedTerms: match.matched, targetIncoming: incoming.get(targetUrl)?.size ?? 0 }
      }
      if (best) proposals.push(best)
    }
    proposals.sort((a, b) => a.targetIncoming - b.targetIncoming || b.matchedTerms.length - a.matchedTerms.length || a.targetUrl.localeCompare(b.targetUrl))
    if (proposals.length > 3) result.limits.suggestions = true
    result.suggestions.push(...proposals.slice(0, 3))
  }
  result.suggestions.sort((a, b) => a.targetIncoming - b.targetIncoming || b.matchedTerms.length - a.matchedTerms.length || a.sourceUrl.localeCompare(b.sourceUrl) || a.targetUrl.localeCompare(b.targetUrl))
  if (result.suggestions.length > INTERNAL_LINK_LIMITS.suggestions) result.limits.suggestions = true
  result.suggestions = result.suggestions.slice(0, INTERNAL_LINK_LIMITS.suggestions)
  result.nodes.sort((a, b) => a.incoming - b.incoming || (b.depth ?? -1) - (a.depth ?? -1) || a.url.localeCompare(b.url))
  Object.assign(result.summary, { pages: pages.size, edges: edgeCount, withoutIncoming: result.nodes.filter(node => node.url !== entry && node.incoming === 0).length,
    unreachable: result.nodes.filter(node => node.depth === null).length, unknownTargets: unknown.size })
  return result
}
