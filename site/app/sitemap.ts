import type { MetadataRoute } from "next"
import { BrandConfig } from "@/lib/config"

/**
 * Génération centralisée du sitemap.
 *
 * Toutes les URLs publiques sont déclarées via la classe SitemapEntry,
 * pour garder une typage strict et éviter les oublis lors de l'ajout de pages.
 */
class SitemapEntry {
  constructor(
    public readonly path: string,
    public readonly priority: number,
    public readonly changeFrequency: NonNullable<
      MetadataRoute.Sitemap[number]["changeFrequency"]
    >,
  ) {}

  toRoute(siteUrl: string, lastModified: Date): MetadataRoute.Sitemap[number] {
    const url = this.path === "" ? siteUrl : `${siteUrl}${this.path}`
    return {
      url,
      lastModified,
      changeFrequency: this.changeFrequency,
      priority: this.priority,
    }
  }
}

const ENTRIES: ReadonlyArray<SitemapEntry> = [
  new SitemapEntry("", 1.0, "weekly"),
  new SitemapEntry("/about", 0.7, "monthly"),
  new SitemapEntry(
    "/integrations/google-business-profile",
    0.8,
    "monthly",
  ),
  new SitemapEntry("/login", 0.5, "monthly"),
  new SitemapEntry("/register", 0.7, "monthly"),
  new SitemapEntry("/legal/mentions-legales", 0.2, "yearly"),
  new SitemapEntry("/legal/privacy", 0.3, "yearly"),
  new SitemapEntry("/legal/terms", 0.3, "yearly"),
  new SitemapEntry("/legal/cookies", 0.2, "yearly"),
]

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL || BrandConfig.getInstance().siteUrl
  const now = new Date()
  return ENTRIES.map((e) => e.toRoute(siteUrl, now))
}
