import { INTERNAL_LINK_LIMITS } from "@seo/shared"
import { prisma } from "./prisma"

const PageSelection = { url: true, title: true, h1: true, statusCode: true, isIndexable: true, redirectUrl: true, canonicalUrl: true, lang: true, internalLinkUrls: true, internalLinks: true, linkingData: true } as const
export async function loadLinkingAuditPages(auditId: string, tenantId: string) {
  const pages: Awaited<ReturnType<typeof batch>> = []
  function batch(skip: number) {
    return prisma.auditPage.findMany({ where: { auditId, tenantId }, orderBy: [{ crawledAt: "asc" }, { id: "asc" }], skip, take: 25, select: PageSelection })
  }
  let bytes = 0
  for (let offset = 0; offset < INTERNAL_LINK_LIMITS.pages; offset += 25) {
    const rows = await batch(offset)
    for (const row of rows) {
      bytes += Buffer.byteLength(JSON.stringify(row), "utf8")
      if (bytes > 8 * 1024 * 1024) return pages
      pages.push(row)
    }
    if (rows.length < 25) break
  }
  return pages
}
