import type { AuditPage } from "@prisma/client"
import type { CrawlMetadata, PageData } from "@seo/shared"

export function crawlMetadata(page: PageData): CrawlMetadata {
  return {
    version: 1,
    contentType: page.contentType,
    twitterCard: page.twitterCard,
    hreflangTags: page.hreflangTags,
    responseHeaders: page.responseHeaders,
    imagesLazyCount: page.imagesLazyCount,
    imagesBelowFold: page.imagesBelowFold,
    imagesBelowFoldLazy: page.imagesBelowFoldLazy,
    error: page.error,
  }
}

export function toAnalysisPage(page: AuditPage): PageData {
  // Metadata is written by this worker; legacy audits have no additional evidence.
  const saved = page.crawlMetadata as unknown as CrawlMetadata | null
  const metadata = saved?.version === 1 ? saved : undefined
  const ogTags = (page.ogTitle || page.ogDescription || page.ogImage || page.ogType)
    ? { title: page.ogTitle ?? undefined, description: page.ogDescription ?? undefined, image: page.ogImage ?? undefined, type: page.ogType ?? undefined }
    : undefined
  return {
    url: page.url,
    statusCode: page.statusCode ?? 0,
    redirectUrl: page.redirectUrl ?? undefined,
    contentType: metadata?.contentType,
    responseTime: page.responseTime ?? 0,
    pageSize: page.pageSize ?? 0,
    title: page.title ?? undefined,
    metaDescription: page.metaDescription ?? undefined,
    h1: page.h1,
    headings: (page.headings as PageData["headings"] | null) ?? { h2: [], h3: [], h4: [] },
    canonicalUrl: page.canonicalUrl ?? undefined,
    metaRobots: page.metaRobots ?? undefined,
    isIndexable: page.isIndexable ?? true,
    images: Array.from({ length: page.totalImages ?? 0 }, (_, i) => ({ src: "", hasAlt: i < (page.imagesWithAlt ?? 0) })),
    internalLinks: page.internalLinkUrls,
    externalLinks: page.externalLinkUrls,
    schemaOrgTypes: page.schemaTypes,
    hasViewport: page.hasViewport ?? false,
    lang: page.lang ?? undefined,
    ogTags,
    wordCount: page.wordCount ?? undefined,
    hasRobotsTxt: page.hasRobotsTxt ?? undefined,
    hasSitemap: page.hasSitemap ?? undefined,
    hasResponsiveMeta: page.hasResponsiveMeta ?? undefined,
    smallTapTargets: page.smallTapTargets ?? undefined,
    smallFontSizes: page.smallFontSizes ?? undefined,
    topKeywords: (page.topKeywords as unknown as PageData["topKeywords"]) ?? undefined,
    twitterCard: metadata?.twitterCard,
    hreflangTags: metadata?.hreflangTags,
    responseHeaders: metadata?.responseHeaders,
    imagesLazyCount: metadata?.imagesLazyCount,
    imagesBelowFold: metadata?.imagesBelowFold,
    imagesBelowFoldLazy: metadata?.imagesBelowFoldLazy,
    error: metadata?.error,
  }
}
