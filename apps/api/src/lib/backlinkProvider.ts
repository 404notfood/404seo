import { z } from "zod"
import { plainCmsText } from "@seo/crawler"
import { isValidPublicUrl } from "@seo/shared/security"
import { CmsError } from "./cmsWordPress"
const Item = z.object({ url_from: z.string().url().max(2048), url_to: z.string().url().max(2048), anchor: z.string().max(10000).nullable(), dofollow: z.boolean() })
export function parseBacklinkResponse(value: unknown, domain: string) {
  const response = z.object({ status_code: z.literal(20000), tasks: z.array(z.object({ status_code: z.literal(20000), result: z.array(z.object({ total_count: z.number().int().nonnegative(), items: z.array(Item).max(100).nullable() })).length(1) })).length(1) }).parse(value)
  const result = response.tasks[0].result[0]
  const backlinks = (result.items ?? []).map(item => {
    if (!isValidPublicUrl(item.url_from) || !isValidPublicUrl(item.url_to)) throw new Error("Invalid backlink URL")
    const target = new URL(item.url_to).hostname.toLowerCase().replace(/^www\./, "")
    if (target !== domain && !target.endsWith("." + domain)) throw new Error("Wrong backlink target")
    return { sourceUrl: item.url_from, sourceDomain: new URL(item.url_from).hostname, targetUrl: item.url_to, anchor: plainCmsText(item.anchor ?? "", 500), dofollow: item.dofollow }
  })
  return { backlinks, totalAvailable: result.total_count }
}
export async function fetchBacklinkProvider(domain: string) {
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) throw new CmsError("L’import automatique nécessite la configuration du fournisseur de backlinks. L’ajout manuel reste disponible.", 503)
  try {
    const response = await fetch("https://api.dataforseo.com/v3/backlinks/backlinks/live", { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: "Basic " + Buffer.from(process.env.DATAFORSEO_LOGIN + ":" + process.env.DATAFORSEO_PASSWORD).toString("base64"), "Content-Type": "application/json" },
      body: JSON.stringify([{ target: domain, mode: "as_is", backlinks_status_type: "live", limit: 100, include_subdomains: true, exclude_internal_backlinks: true }]) })
    if (!response.ok || !response.body) throw new Error("provider")
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("size") }; chunks.push(value) }
    return parseBacklinkResponse(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown, domain)
  } catch { throw new CmsError("Le fournisseur de backlinks n’a pas confirmé l’import. Les données existantes sont conservées.", 502) }
}
