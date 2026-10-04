import { SaxesParser } from "saxes"
import { gunzipSync } from "node:zlib"
import { fetchPublicUrl, isValidPublicUrl } from "@seo/shared/security"
import { internalLinkBelongsToProject, normalizeInternalLinkUrl } from "@seo/shared"
import type { SitemapDocument, SitemapDocumentStatus, SitemapInventory } from "@seo/shared"

export const SITEMAP_IMPORT_LIMITS = { documents: 20, queuedDocuments: 100, urls: 10_000, documentBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024, storedBytes: 4 * 1024 * 1024, durationMs: 20_000, requestMs: 5000, depth: 2 } as const
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9"

class SitemapFormatError extends Error {
  constructor(readonly status: SitemapDocumentStatus = "INVALID_XML") { super("Sitemap non exploitable") }
}

export interface SitemapFetchResponse { status: number; headers: Record<string, string>; body: Uint8Array }
export type SitemapFetch = (url: string, options: { maxBytes: number; timeoutMs: number }) => Promise<SitemapFetchResponse>
const publicFetch: SitemapFetch = async (url, options) => {
  try { return await fetchPublicUrl(url, { ...options, followRedirects: false }) }
  catch (error) {
    if (error instanceof Error && error.message.includes("volumineuse")) throw new SitemapFormatError("TOO_LARGE")
    throw error
  }
}

function safeDocumentUrl(value: string, projectUrl: string): string | null {
  const url = normalizeInternalLinkUrl(value)
  return url && new URL(url).origin === new URL(projectUrl).origin && isValidPublicUrl(url) ? url : null
}

export function parseSitemapXml(xml: string, projectUrl: string): { kind: "URLSET" | "INDEX"; urls: string[]; omitted: number } {
  if (Buffer.byteLength(xml, "utf8") > SITEMAP_IMPORT_LIMITS.documentBytes) throw new SitemapFormatError("TOO_LARGE")
  // Parse only well-formed XML. No DTD, custom entities or external resource loading.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new SitemapFormatError()
  const parser = new SaxesParser({ xmlns: true })
  let depth = 0, nodes = 0, rootNamespace = "", kind: "URLSET" | "INDEX" | null = null
  let inItem = false, collecting = false, malformedLoc = false, locCount = 0, locText = "", omitted = 0
  const found = new Set<string>()
  parser.on("error", () => { throw new SitemapFormatError() })
  parser.on("doctype", () => { throw new SitemapFormatError() })
  parser.on("opentag", tag => {
    if (++depth > 32 || ++nodes > 50_000) throw new SitemapFormatError("TOO_LARGE")
    if (depth === 1) {
      if (!["urlset", "sitemapindex"].includes(tag.local) || tag.uri && tag.uri !== SITEMAP_NAMESPACE) throw new SitemapFormatError()
      kind = tag.local === "urlset" ? "URLSET" : "INDEX"; rootNamespace = tag.uri
    } else if (depth === 2) {
      inItem = tag.local === (kind === "URLSET" ? "url" : "sitemap") && tag.uri === rootNamespace
      if (!inItem && tag.local === (kind === "URLSET" ? "url" : "sitemap")) omitted++
      locCount = 0; locText = ""; malformedLoc = false
    } else if (depth === 3 && inItem && tag.local === "loc" && tag.uri === rootNamespace) {
      collecting = true; locCount++
    } else if (depth > 3 && collecting) malformedLoc = true
  })
  const text = (value: string) => {
    if (!collecting || malformedLoc) return
    if (locText.length + value.length > 2048) malformedLoc = true
    else locText += value
  }
  parser.on("text", text); parser.on("cdata", text)
  parser.on("closetag", () => {
    if (depth === 3) collecting = false
    if (depth === 2 && inItem) {
      const url = locCount === 1 && !malformedLoc ? normalizeInternalLinkUrl(locText.trim()) : null
      if (!url || !isValidPublicUrl(url) || (kind === "INDEX" ? !safeDocumentUrl(url, projectUrl) : !internalLinkBelongsToProject(url, projectUrl))) omitted++
      else found.add(url)
      inItem = false
    }
    depth--
  })
  parser.on("xmldecl", declaration => { if (declaration.encoding && !/^utf-?8$/iu.test(declaration.encoding)) throw new SitemapFormatError() })
  parser.write(xml).close()
  if (!kind) throw new SitemapFormatError()
  return { kind, urls: [...found], omitted }
}

export function sitemapRootsFromRobots(text: string, projectUrl: string): string[] {
  const roots = new Set<string>()
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)\s*(?:#.*)?$/iu)
    if (!match) continue
    const url = safeDocumentUrl(match[1], projectUrl)
    if (url) roots.add(url)
    if (roots.size >= SITEMAP_IMPORT_LIMITS.documents) break
  }
  return [...roots]
}

async function requestDocument(url: string, projectUrl: string, fetcher: SitemapFetch, maxBytes: number, deadline: number, now: () => number): Promise<{ url: string; response: SitemapFetchResponse }> {
  let current = url
  for (let hop = 0; hop < 3; hop++) {
    if (!safeDocumentUrl(current, projectUrl)) throw new SitemapFormatError("REDIRECT_BLOCKED")
    const remaining = deadline - now()
    if (remaining <= 0) throw new SitemapFormatError("FETCH_ERROR")
    const timeoutMs = Math.min(SITEMAP_IMPORT_LIMITS.requestMs, remaining)
    let timer: ReturnType<typeof setTimeout> | undefined
    let response: SitemapFetchResponse
    try {
      response = await Promise.race([
        fetcher(current, { maxBytes, timeoutMs }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SitemapFormatError("FETCH_ERROR")), timeoutMs) }),
      ])
    } finally { clearTimeout(timer) }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = normalizeInternalLinkUrl(response.headers.location ?? "", current)
      if (!target || !safeDocumentUrl(target, projectUrl)) throw new SitemapFormatError("REDIRECT_BLOCKED")
      current = target; continue
    }
    if (response.body.byteLength > maxBytes) throw new SitemapFormatError("TOO_LARGE")
    return { url: current, response }
  }
  throw new SitemapFormatError("REDIRECT_BLOCKED")
}

export async function collectSitemapInventory(projectUrl: string, explicitUrl?: string, options: { fetch?: SitemapFetch; now?: () => number } = {}): Promise<SitemapInventory> {
  if (!isValidPublicUrl(projectUrl) || explicitUrl && !safeDocumentUrl(explicitUrl, projectUrl)) throw new Error("Sitemap hors périmètre")
  const fetcher = options.fetch ?? publicFetch, now = options.now ?? Date.now, deadline = now() + SITEMAP_IMPORT_LIMITS.durationMs
  const result: SitemapInventory = { version: 1, roots: [], documents: [], pages: [], omittedUrls: 0, limits: { documents: false, urls: false, bytes: false, time: false, depth: false, stored: false } }
  if (explicitUrl) result.roots = [safeDocumentUrl(explicitUrl, projectUrl)!]
  else {
    try {
      const { response } = await requestDocument(`${new URL(projectUrl).origin}/robots.txt`, projectUrl, fetcher, 64 * 1024, deadline, now)
      if (response.status === 200) {
        const robots = new TextDecoder("utf-8", { fatal: true }).decode(response.body)
        result.roots = sitemapRootsFromRobots(robots, projectUrl)
        const declarations = robots.split(/\r?\n/u).filter(line => /^\s*sitemap\s*:/iu.test(line)).length
        result.limits.documents ||= declarations > result.roots.length
      }
    } catch { /* A missing robots file does not prevent trying the conventional sitemap URL. */ }
    if (!result.roots.length) result.roots = [`${new URL(projectUrl).origin}/sitemap.xml`]
  }
  const queue = result.roots.map(url => ({ url, depth: 0 }))
  const scheduled = new Set(result.roots), parsed = new Set<string>(), pages = new Map<string, { url: string; documentIndexes: number[] }>()
  let totalBytes = 0, storedBytes = 128 * 1024, declaredChildren = 0
  for (let index = 0; index < queue.length; index++) {
    if (result.documents.length >= SITEMAP_IMPORT_LIMITS.documents) { result.limits.documents = true; break }
    if (now() >= deadline) { result.limits.time = true; break }
    if (totalBytes >= SITEMAP_IMPORT_LIMITS.totalBytes) { result.limits.bytes = true; break }
    const item = queue[index]
    const doc: SitemapDocument = { url: item.url, status: "FETCH_ERROR", httpStatus: null, kind: null, urlCount: 0 }
    const documentIndex = result.documents.length
    result.documents.push(doc)
    try {
      const fetched = await requestDocument(item.url, projectUrl, fetcher, Math.min(SITEMAP_IMPORT_LIMITS.documentBytes, SITEMAP_IMPORT_LIMITS.totalBytes - totalBytes), deadline, now)
      doc.url = fetched.url; doc.httpStatus = fetched.response.status
      if (doc.httpStatus !== 200) { doc.status = "HTTP_ERROR"; continue }
      if (parsed.has(doc.url)) { result.documents.pop(); continue }
      let body = Buffer.from(fetched.response.body)
      if (body[0] === 0x1f && body[1] === 0x8b) {
        try { body = gunzipSync(body, { maxOutputLength: SITEMAP_IMPORT_LIMITS.documentBytes }) } catch { throw new SitemapFormatError("TOO_LARGE") }
      }
      totalBytes += body.byteLength
      if (totalBytes > SITEMAP_IMPORT_LIMITS.totalBytes) { result.limits.bytes = true; throw new SitemapFormatError("TOO_LARGE") }
      let xml: string
      try { xml = new TextDecoder("utf-8", { fatal: true }).decode(body) } catch { throw new SitemapFormatError() }
      const contents = parseSitemapXml(xml, projectUrl)
      doc.kind = contents.kind; doc.urlCount = contents.urls.length; doc.status = "OK"; parsed.add(doc.url)
      result.omittedUrls += contents.omitted
      if (contents.kind === "INDEX") {
        declaredChildren += contents.urls.length
        for (const child of contents.urls) {
          if (scheduled.has(child)) continue
          if (item.depth >= SITEMAP_IMPORT_LIMITS.depth) { result.limits.depth = true; continue }
          if (scheduled.size >= SITEMAP_IMPORT_LIMITS.queuedDocuments) { result.limits.documents = true; continue }
          scheduled.add(child); queue.push({ url: child, depth: item.depth + 1 })
        }
      } else {
        for (const url of contents.urls) {
          const existing = pages.get(url)
          if (existing) { if (existing.documentIndexes.length < 3 && !existing.documentIndexes.includes(documentIndex)) existing.documentIndexes.push(documentIndex); continue }
          if (pages.size >= SITEMAP_IMPORT_LIMITS.urls) { result.limits.urls = true; continue }
          const bytes = Buffer.byteLength(url, "utf8") + 128
          if (storedBytes + bytes > SITEMAP_IMPORT_LIMITS.storedBytes) { result.limits.stored = true; continue }
          pages.set(url, { url, documentIndexes: [documentIndex] }); storedBytes += bytes
        }
      }
    } catch (error) {
      doc.status = error instanceof SitemapFormatError ? error.status : "FETCH_ERROR"
      if (doc.status === "TOO_LARGE") result.limits.bytes = true
    }
  }
  if (now() >= deadline && queue.length > result.documents.length) result.limits.time = true
  if (!result.documents.some(doc => doc.status === "OK") || declaredChildren > 0 && !result.documents.some(doc => doc.status === "OK" && doc.kind === "URLSET")) throw new Error("Aucun sitemap de pages exploitable")
  result.pages = [...pages.values()]
  return result
}
