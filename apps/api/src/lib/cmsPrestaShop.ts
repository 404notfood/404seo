import { z } from "zod"
import { fetchPublicUrl, isValidPublicUrl } from "@seo/shared/security"
import type { CmsResource } from "@seo/shared"
import { plainCmsText } from "@seo/crawler"
import { CmsError, CmsResourceSchema, seoText } from "./cmsWordPress"
import type { CmsFetch, WordPressResource } from "./cmsWordPress"

export const PrestaShopCredentials = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const Scope = z.string().regex(/^[1-9][0-9]{0,9}:[1-9][0-9]{0,9}$/)
export class PrestaShopClient {
  constructor(private siteUrl: string, private credentials: z.infer<typeof PrestaShopCredentials>, private scope = "", private fetch: CmsFetch = fetchPublicUrl) {}
  private async request(action: string, parameters: Record<string, string> = {}, body?: unknown): Promise<unknown> {
    const url = new URL("index.php", this.siteUrl)
    url.search = new URLSearchParams({ fc: "module", module: "seo404connector", controller: "api", ajax: "1", action, ...parameters, ...(this.scope ? { scope: Scope.parse(this.scope) } : {}) }).toString()
    try {
      const response = await this.fetch(url.href, { authenticated: true, followRedirects: false, timeoutMs: 15_000, maxBytes: 512 * 1024,
        method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
        headers: { Authorization: "Bearer " + this.credentials.token, Accept: "application/json", "Content-Type": "application/json" } })
      if (response.status === 409) throw new CmsError("Le contenu ou le périmètre PrestaShop a changé. Préparez une nouvelle proposition.", 409)
      if ([401, 403].includes(response.status)) throw new CmsError("Accès PrestaShop refusé. Vérifiez la clé du module et son périmètre.", 403)
      if (!response.ok) throw new CmsError("Le module PrestaShop n’a pas confirmé la requête.", 502)
      return JSON.parse(await response.text()) as unknown
    } catch (error) {
      if (error instanceof CmsError) throw error
      throw new CmsError("PrestaShop n’a pas confirmé la requête. Vérifiez la connexion.", 502)
    }
  }
  async verify(): Promise<{ label: string; scope: string }> {
    const data = z.object({ version: z.literal(1), siteUrl: z.string().url(), label: z.string().max(200), scope: Scope }).parse(await this.request("connection"))
    const remote = new URL(data.siteUrl), site = new URL(this.siteUrl)
    if (!isValidPublicUrl(data.siteUrl) || remote.origin !== site.origin || remote.pathname.replace(/\/+$/, "") !== site.pathname.replace(/\/+$/, "")) throw new CmsError("Le module répond pour une autre boutique.")
    return { label: plainCmsText(data.label, 200), scope: data.scope }
  }
  private resource(value: unknown): WordPressResource {
    const data = CmsResourceSchema.extend({ kind: z.literal("product"), seoTitle: seoText(255), seoDescription: seoText(512), scope: Scope }).parse(value)
    if (!this.scope || data.scope !== this.scope) throw new CmsError("La langue ou la boutique ne correspond pas à la connexion.", 409)
    const page = new URL(data.url), site = new URL(this.siteUrl)
    if (!isValidPublicUrl(data.url) || page.origin !== site.origin || !page.pathname.startsWith(site.pathname)) throw new CmsError("Le produit ne correspond pas au site connecté.", 502)
    const { scope: _scope, ...resource } = data
    return { ...resource, title: plainCmsText(resource.title, 500), content: plainCmsText(resource.content, 8000) }
  }
  async list(page: number, kind: CmsResource["kind"]): Promise<{ resources: CmsResource[]; hasMore: boolean }> {
    if (kind !== "product") throw new CmsError("Le pilote PrestaShop concerne les produits.")
    const data = z.object({ resources: z.array(z.unknown()).max(25), hasMore: z.boolean() }).parse(await this.request("resources", { page: String(page) }))
    return { resources: data.resources.map(value => this.resource(value)), hasMore: data.hasMore }
  }
  async read(id: number): Promise<WordPressResource> { return this.resource(await this.request("read", { id: String(id) })) }
  async reconcile(id: number, operationId: string): Promise<WordPressResource> { return this.resource(await this.request("reconcile", { id: String(id) }, { operationId })) }
  async write(id: number, revision: string, operationId: string, seoTitle: string | null, seoDescription: string | null): Promise<WordPressResource> {
    return this.resource(await this.request("write", { id: String(id) }, { revision, operationId, seoTitle, seoDescription }))
  }
}
