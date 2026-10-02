import type { CheerioAPI } from "cheerio"

export function googleRobotsMeta($: CheerioAPI): string[] {
  return $("meta[name]").toArray().flatMap(element => {
    const name = ($(element).attr("name") ?? "").trim().toLowerCase()
    return ["robots", "googlebot"].includes(name) ? [$(element).attr("content") ?? ""] : []
  })
}

/** Separate header lines retain the scope of each user-agent-specific directive. */
export function readGoogleRobotsRules(meta: string[], headers: string[] = []) {
  const values = [...meta]
  const settings = new Set(["max-snippet", "max-image-preview", "max-video-preview", "unavailable_after"])
  for (const header of headers) {
    let agent: string | null = null
    for (const segment of header.toLowerCase().split(",")) {
      const match = segment.trim().match(/^([a-z0-9_-]+):\s*(.*)$/u)
      let value = segment.trim()
      if (match && !settings.has(match[1])) { agent = match[1]; value = match[2] }
      if (!agent || agent === "googlebot") values.push(value)
    }
  }
  const rules = values.flatMap(value => value.toLowerCase().split(",").flatMap(segment => segment.includes(":") ? [] : segment.trim().split(/\s+/u)))
  return { noindex: rules.includes("noindex") || rules.includes("none"), nofollow: rules.includes("nofollow") || rules.includes("none"), raw: values.join(", ").toLowerCase() }
}
