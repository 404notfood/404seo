import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import type { LookupFunction } from "node:net"

function hostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
}

export function isPublicAddress(address: string): boolean {
  const host = hostname(address)
  if (isIP(host) === 4) {
    const [a, b, c] = host.split(".").map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113))
  }
  if (isIP(host) === 6) {
    // Only global unicast; deny mapped IPv4, transition, documentation and special-use ranges.
    const [first, second = "0"] = host.split(":")
    const prefix = parseInt(first, 16)
    const subnet = parseInt(second || "0", 16)
    return prefix >= 0x2000 && prefix <= 0x3fff && prefix !== 0x2002 &&
      !(prefix === 0x2001 && (subnet < 0x200 || subnet === 0xdb8)) &&
      !(prefix === 0x3fff && subnet <= 0x0fff)
  }
  return false
}

export function isValidPublicUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const host = hostname(url.hostname)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false
    if (url.port && !["80", "443"].includes(url.port)) return false
    if (!host.includes(".") && !isIP(host)) return false
    if (["localhost", "metadata.google.internal"].includes(host) ||
      [".localhost", ".local", ".internal", ".lan", ".home", ".test", ".invalid"].some((suffix) => host.endsWith(suffix))) return false
    return isIP(host) ? isPublicAddress(host) : true
  } catch { return false }
}

export async function resolvePublicAddress(host: string): Promise<{ address: string; family: number }> {
  const normalized = hostname(host)
  const records = isIP(normalized)
    ? [{ address: normalized, family: isIP(normalized) }]
    : await lookup(normalized, { all: true, verbatim: true })
  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new Error("Adresse réseau non publique")
  }
  return records[0]
}

export async function isValidPublicUrlWithDns(value: string): Promise<boolean> {
  if (!isValidPublicUrl(value)) return false
  try { await resolvePublicAddress(new URL(value).hostname); return true } catch { return false }
}

export interface PublicResponse {
  url: string
  status: number
  ok: boolean
  headers: Record<string, string>
  body: Buffer
  text(): Promise<string>
}

/** DNS is resolved once per hop and pinned to the socket, with TLS hostname verification intact. */
export async function fetchPublicUrl(value: string, options: {
  maxBytes?: number; timeoutMs?: number; maxRedirects?: number; userAgent?: string; method?: "GET" | "HEAD"; followRedirects?: boolean
} = {}): Promise<PublicResponse> {
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  const deadline = Date.now() + (options.timeoutMs ?? 10_000)
  let current = value
  for (let hop = 0; hop <= (options.maxRedirects ?? 5); hop++) {
    if (!isValidPublicUrl(current)) throw new Error("URL bloquée (SSRF)")
    const url = new URL(current)
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error("Délai réseau dépassé")
    let dnsTimer: NodeJS.Timeout | undefined
    const record = await Promise.race([
      resolvePublicAddress(url.hostname),
      new Promise<never>((_, reject) => {
        dnsTimer = setTimeout(() => reject(new Error("Délai DNS dépassé")), remaining)
        dnsTimer.unref()
      }),
    ]).finally(() => clearTimeout(dnsTimer))
    const response = await new Promise<PublicResponse>((resolve, reject) => {
      const pinnedLookup: LookupFunction = (_host, lookupOptions, callback) => {
        if (lookupOptions.all) callback(null, [record])
        else callback(null, record.address, record.family)
      }
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        agent: false, lookup: pinnedLookup, method: options.method ?? "GET",
        headers: { "User-Agent": options.userAgent ?? "SEOAuditBot/1.0", "Accept-Encoding": "identity" },
      }, (res) => {
        const status = res.statusCode ?? 0
        const headers: Record<string, string> = {}
        for (const [key, val] of Object.entries(res.headers)) {
          if (val !== undefined) headers[key] = Array.isArray(val) ? val.join(", ") : val
        }
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.destroy()
          resolve({ url: current, status, ok: false, headers, body: Buffer.alloc(0), text: async () => "" })
          return
        }
        if (Number(headers["content-length"]) > maxBytes) {
          request.destroy(new Error("Réponse trop volumineuse")); return
        }
        if (headers["content-encoding"] && headers["content-encoding"] !== "identity") {
          request.destroy(new Error("Encodage compressé non sollicité")); return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) request.destroy(new Error("Réponse trop volumineuse"))
          else chunks.push(chunk)
        })
        res.on("error", reject)
        res.on("end", () => {
          const body = Buffer.concat(chunks)
          resolve({ url: current, status, ok: status >= 200 && status < 300, headers, body, text: async () => body.toString("utf8") })
        })
      })
      const timer = setTimeout(() => request.destroy(new Error("Délai réseau dépassé")), Math.max(1, deadline - Date.now()))
      request.on("close", () => clearTimeout(timer))
      request.on("error", reject)
      request.end()
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    if (!response.headers.location) throw new Error("Redirection sans destination")
    if (options.followRedirects === false) {
      const target = new URL(response.headers.location, current).href
      if (!(await isValidPublicUrlWithDns(target))) throw new Error("Redirection bloquée (SSRF)")
      return response
    }
    current = new URL(response.headers.location, current).href
  }
  throw new Error("Trop de redirections")
}
