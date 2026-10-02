import { load } from "cheerio"

/** Untrusted CMS markup never becomes stored HTML or executable instructions. */
export function plainCmsText(value: string, max: number): string {
  const $ = load(value, undefined, false)
  $("script,style,iframe,object,embed,template").remove()
  return Array.from($.root().text().replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, max).join("")
}
