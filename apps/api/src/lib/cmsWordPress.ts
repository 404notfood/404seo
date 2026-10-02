import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { z } from "zod"
import { fetchPublicUrl, isValidPublicUrl } from "@seo/shared/security"
import type { CmsResource, CmsTextPatch } from "@seo/shared"
import { plainCmsText } from "@seo/crawler"

export class CmsError extends Error {
  constructor(message: string, public statusCode = 400) { super(message) }
}

export function seoText(max: number) { return z.string().max(max).refine(value => !/[<>\u0000-\u001f\u007f]/.test(value), "Texte simple requis") }
export const CmsTextPatchSchema = z.object({ id: z.string().regex(/^(body|description|short):[ta]:[0-9]{1,6}$/), text: z.string().min(1).max(400).refine(value => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) }).strict()
export const CmsResourceSchema = z.object({
  id: z.number().int().positive().max(2147483647), url: z.string().url().max(2048),
  title: z.string().max(500), kind: z.enum(["post", "page", "product", "category", "cms"]),
  content: z.string().max(8000),
  seoTitle: seoText(100).nullable(), seoDescription: seoText(320).nullable(),
  revision: z.string().regex(/^[a-f0-9]{64}$/), operationId: z.string().max(100).optional(),
  segments: z.array(CmsTextPatchSchema.extend({ type: z.enum(["CONTENT", "ALT"]) })).max(32).optional(),
}).strict()
export type WordPressResource = z.infer<typeof CmsResourceSchema>
export interface WordPressCredentials { username: string; applicationPassword: string }
export type CmsFetch = typeof fetchPublicUrl

function encryptionKey(): Buffer {
  const value = process.env.CMS_CREDENTIAL_KEY ?? ""
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new CmsError("Les connexions CMS ne sont pas encore activées.", 503)
  return Buffer.from(value, "hex")
}
export function cmsConfigured(): boolean { return /^[a-f0-9]{64}$/i.test(process.env.CMS_CREDENTIAL_KEY ?? "") }
export function encryptCmsCredentials(value: WordPressCredentials | { token: string }, context: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  cipher.setAAD(Buffer.from(context))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64")).join(".")
}
export function decryptCmsCredentials(value: string, context: string): WordPressCredentials {
  return z.object({ username: z.string().min(1).max(100), applicationPassword: z.string().min(1).max(200) }).strict().parse(decryptCmsSecret(value, context))
}
export function decryptCmsSecret(value: string, context: string): unknown {
  try {
    const [iv, tag, encrypted] = value.split(".").map(part => Buffer.from(part, "base64"))
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv)
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as unknown
  } catch { throw new CmsError("Impossible de lire cette connexion. Reconnectez le site.", 503) }
}

export function wordpressBase(siteUrl: string, domain: string): string {
  if (!isValidPublicUrl(siteUrl) || /\\/.test(siteUrl)) throw new CmsError("Adresse de site non autorisée.")
  const site = new URL(siteUrl), project = new URL(domain)
  if (site.protocol !== "https:" || site.hostname.toLowerCase() !== project.hostname.toLowerCase() ||
    site.port || site.search || site.hash || /(?:%2f|%5c|\\)/i.test(site.pathname)) throw new CmsError("Utilisez l’adresse HTTPS du domaine de ce projet.")
  site.pathname = site.pathname.replace(/\/+$/, "") + "/"
  const projectPath = project.pathname.replace(/\/+$/, "") + "/"
  if (!site.pathname.startsWith(projectPath)) throw new CmsError("Le CMS doit correspondre au périmètre de ce projet.")
  return site.href
}

export class WordPressClient {
  constructor(private siteUrl: string, private credentials: WordPressCredentials, private fetch: CmsFetch = fetchPublicUrl) {}
  private async request(path: string, body?: unknown): Promise<unknown> {
    const url = new URL("wp-json/seo404/v1/" + path, this.siteUrl).href
    try {
      const response = await this.fetch(url, { authenticated: true, followRedirects: false, timeoutMs: 15_000, maxBytes: 512 * 1024,
        method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
        headers: { Authorization: "Basic " + Buffer.from(this.credentials.username + ":" + this.credentials.applicationPassword).toString("base64"),
          Accept: "application/json", "Content-Type": "application/json" } })
      if (response.status === 409) throw new CmsError("Le contenu a changé dans WordPress. Préparez une nouvelle proposition.", 409)
      if (response.status === 401 || response.status === 403) throw new CmsError("Accès WordPress refusé. Vérifiez le mot de passe d’application et les droits du compte.", 403)
      if (!response.ok) throw new CmsError("Le connecteur WordPress est indisponible. Vérifiez son installation et la connexion.", 502)
      return JSON.parse(await response.text()) as unknown
    } catch (error) {
      if (error instanceof CmsError) throw error
      // Never propagate a remote response, URL query or authentication secret into logs/UI.
      throw new CmsError("WordPress n’a pas confirmé la requête. Vérifiez la connexion.", 502)
    }
  }
  async verify(): Promise<{ label: string }> {
    const data = z.object({ version: z.literal(1), siteUrl: z.string().url(), label: z.string().max(200) }).parse(await this.request("connection"))
    if (new URL(data.siteUrl).origin !== new URL(this.siteUrl).origin) throw new CmsError("Le connecteur répond pour une autre adresse de site.")
    return { label: plainCmsText(data.label, 200) }
  }
  private validateResource(value: unknown): WordPressResource {
    const resource = CmsResourceSchema.extend({ kind: z.enum(["post", "page", "product"]) }).parse(value)
    const page = new URL(resource.url), site = new URL(this.siteUrl)
    if (!isValidPublicUrl(resource.url) || page.origin !== site.origin ||
      !page.pathname.startsWith(site.pathname) && page.pathname !== site.pathname.replace(/\/$/, "")) throw new CmsError("La page ne correspond pas au site connecté.", 502)
    return { ...resource, title: plainCmsText(resource.title, 500), content: plainCmsText(resource.content, 8000) }
  }
  async list(page: number, kind: CmsResource["kind"]): Promise<{ resources: CmsResource[]; hasMore: boolean }> {
    const data = z.object({ resources: z.array(z.unknown()).max(25), hasMore: z.boolean() }).parse(await this.request("resources?" + new URLSearchParams({ page: String(page), kind })))
    return { resources: data.resources.map(value => this.validateResource(value)), hasMore: data.hasMore }
  }
  async read(id: number, _kind?: CmsResource["kind"]): Promise<WordPressResource> {
    const resource = this.validateResource(await this.request("resources/" + id))
    if (resource.id !== id) throw new CmsError("Le contenu demandé n’est pas confirmé.", 502)
    return resource
  }
  async reconcile(id: number, operationId: string, _kind?: CmsResource["kind"]): Promise<WordPressResource> {
    const resource = this.validateResource(await this.request("resources/" + id + "/reconcile", { operationId }))
    if (resource.id !== id) throw new CmsError("Le connecteur n’a pas confirmé le contenu demandé.", 502)
    return resource
  }
  async write(id: number, revision: string, operationId: string, title: string | null, description: string | null, _kind?: CmsResource["kind"], patches?: CmsTextPatch[]): Promise<WordPressResource> {
    const resource = this.validateResource(await this.request("resources/" + id, { revision, operationId, seoTitle: title, seoDescription: description, ...(patches?.length ? { patches } : {}) }))
    if (resource.id !== id) throw new CmsError("Le connecteur n’a pas confirmé le contenu demandé.", 502)
    return resource
  }
}
