import type { Page } from "playwright"

export async function measureMobileMetrics(page: Page) {
  return page.evaluate(() => {
    const clickables = Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [role='button']"))
      .filter(el => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return rect.width > 0 && rect.height > 0 && style.visibility === "visible" && style.display !== "none"
          && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          && !el.closest('[hidden], [inert], [aria-hidden="true"]') && !el.matches(":disabled")
      })
    const targets = clickables.filter(el => !el.parentElement?.closest("a[href], button, [role='button']"))
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
    let smallTapTargets = 0
    const tapTargetIssues: { label: string; selector: string; url?: string; width: number; height: number }[] = []
    for (const { el, rect } of targets) {
      if (rect.width >= 24 && rect.height >= 24) continue
      // Inline links within a sentence are exempt from the minimum target size.
      if (el.tagName === "A" && window.getComputedStyle(el).display === "inline"
        && el.parentElement && ["P", "LI", "TD", "LABEL"].includes(el.parentElement.tagName)
        && el.parentElement.textContent?.trim() !== el.textContent?.trim()) continue
      const x = rect.x + rect.width / 2
      const y = rect.y + rect.height / 2
      const crowded = targets.some(other => {
        if (other.el === el || el.contains(other.el) || other.el.contains(el)) return false
        const r = other.rect
        if (r.width < 24 || r.height < 24) {
          return Math.hypot(x - (r.x + r.width / 2), y - (r.y + r.height / 2)) < 24
        }
        const dx = Math.max(r.left - x, 0, x - r.right)
        const dy = Math.max(r.top - y, 0, y - r.bottom)
        return Math.hypot(dx, dy) < 12
      })
      if (crowded) {
        smallTapTargets++
        if (tapTargetIssues.length < 100) {
          const parts: string[] = []
          let current: Element | null = el
          while (current && current !== document.documentElement) {
            if (current.id) { parts.unshift(`#${CSS.escape(current.id)}`); break }
            const tag = current.tagName.toLowerCase()
            const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(node => node.tagName === current?.tagName) : []
            parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`)
            current = current.parentElement
          }
          tapTargetIssues.push({
            label: (el.getAttribute("aria-label") || el.textContent?.trim() || el.getAttribute("title") || el.tagName.toLowerCase()).replace(/\s+/g, " ").slice(0, 160),
            selector: parts.join(" > ").slice(0, 500),
            url: el instanceof HTMLAnchorElement && /^https?:\/\//i.test(el.href) ? el.href : undefined,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          })
        }
      }
    }
    let smallFontSizes = 0
    for (const el of document.querySelectorAll<HTMLElement>("p, span, li, td, th, label, div")) {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      // Count direct text once, excluding hidden responsive menus and containers.
      const text = Array.from(el.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
      if (text && rect.width > 0 && rect.height > 0 && style.visibility === "visible"
        && !el.closest('[hidden], [inert], [aria-hidden="true"]')
        && parseFloat(style.fontSize) > 0 && parseFloat(style.fontSize) < 12) smallFontSizes++
    }
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? ""
    const images = Array.from(document.querySelectorAll("img")).filter(el => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility === "visible" && rect.top >= window.innerHeight
    })
    return {
      smallTapTargets, tapTargetIssues, smallFontSizes,
      hasResponsiveMeta: /width\s*=\s*device-width/i.test(viewport),
      imagesBelowFold: images.length,
      imagesBelowFoldLazy: images.filter(el => el.loading === "lazy").length,
    }
  })
}
