/** Legacy crawl records without a MIME type retain their previous HTML checks. */
export function isHtmlContentType(contentType?: string): boolean {
  if (!contentType?.trim()) return true
  const mime = contentType.split(";", 1)[0].trim().toLowerCase()
  return mime === "text/html" || mime === "application/xhtml+xml"
}
