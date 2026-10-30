import type { CheckEvidence } from "./types/index"

/** Read only bounded, plain evidence from versioned crawl metadata. */
export function getStoredCheckEvidence(checkName: string, metadata: unknown): CheckEvidence[] | undefined {
  if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== 1) return undefined
  const key = checkName === "images_alt" ? "imageAltIssues" : checkName === "tap_targets" ? "tapTargetIssues" : undefined
  if (!key || !(key in metadata)) return undefined
  const items: unknown = (metadata as Record<string, unknown>)[key]
  if (!Array.isArray(items)) return undefined
  return items.slice(0, 100).flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || !("label" in item) || typeof item.label !== "string") return []
    const record = item as Record<string, unknown>
    return [{
      label: item.label.slice(0, 300),
      url: typeof record.url === "string" ? record.url.slice(0, 2048) : undefined,
      selector: typeof record.selector === "string" ? record.selector.slice(0, 500) : undefined,
      width: typeof record.width === "number" && Number.isFinite(record.width) ? record.width : undefined,
      height: typeof record.height === "number" && Number.isFinite(record.height) ? record.height : undefined,
    }]
  })
}
