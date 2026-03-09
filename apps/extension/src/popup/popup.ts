// popup/popup.ts

import type { PageAnalysisResponse } from "../content/content-script"

document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab.id || !tab.url) {
    showError("Impossible d'analyser cet onglet.")
    return
  }

  if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) {
    showError("SEO Audit ne fonctionne pas sur les pages système Chrome.")
    return
  }

  // Afficher le plan depuis les settings
  const settings = await chrome.storage.sync.get(["apiUrl", "apiToken"])
  if (settings.apiToken) {
    const badge = document.getElementById("plan-badge")
    if (badge) {
      badge.textContent = "Connecté"
      badge.style.background = "#10b981"
    }
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_DATA" }) as PageAnalysisResponse
    renderResults(tab, response)
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/content-script.js"],
      })
      const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_DATA" }) as PageAnalysisResponse
      renderResults(tab, response)
    } catch {
      showError("Impossible d'analyser cette page. Rechargez et réessayez.")
    }
  }
})

function escapeHtml(str: string): string {
  const div = document.createElement("div")
  div.textContent = str
  return div.innerHTML
}

function renderResults(tab: chrome.tabs.Tab, response: PageAnalysisResponse) {
  const { score, issues, data } = response

  document.getElementById("loading")!.style.display = "none"
  document.getElementById("content")!.style.display = "block"

  // Score circle
  const scoreEl = document.getElementById("score-value")!
  const circleEl = document.getElementById("score-circle")!
  const gradeEl = document.getElementById("score-grade")!
  scoreEl.textContent = String(score)

  if (score >= 70) {
    circleEl.classList.add("good")
    gradeEl.textContent = "Bon SEO"
  } else if (score >= 40) {
    circleEl.classList.add("warn")
    gradeEl.textContent = "SEO moyen"
  } else {
    circleEl.classList.add("bad")
    gradeEl.textContent = "SEO faible"
  }

  // URL affichée
  const urlEl = document.getElementById("page-url")!
  const cleanUrl = data.url.replace(/^https?:\/\//, "")
  urlEl.textContent = cleanUrl.length > 45 ? cleanUrl.substring(0, 45) + "…" : cleanUrl

  // Liste des vérifications (échappement XSS)
  const listEl = document.getElementById("issues-list")!
  listEl.innerHTML = issues.map((issue) => `
    <div class="issue-item">
      <div class="dot ${escapeHtml(issue.status)}"></div>
      <div>
        <div class="issue-label">${escapeHtml(issue.label)}</div>
        <div class="issue-detail">${escapeHtml(issue.detail)}</div>
      </div>
    </div>
  `).join("")

  // Mettre à jour le badge sur l'icône
  if (tab.id) {
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", score, tabId: tab.id })
  }

  // Bouton audit complet
  document.getElementById("btn-full-audit")!.addEventListener("click", async () => {
    const settings = await chrome.storage.sync.get(["apiUrl", "apiToken"])
    const appUrl = (settings.apiUrl as string | undefined) ?? "http://localhost:3000"

    if (!settings.apiToken) {
      chrome.tabs.create({ url: `${appUrl}/login?from=extension` })
    } else {
      await launchFullAudit(data.url, appUrl, settings.apiToken as string)
    }
  })

  // Bouton dashboard
  document.getElementById("btn-open-dashboard")!.addEventListener("click", async () => {
    const settings = await chrome.storage.sync.get(["apiUrl"])
    const appUrl = (settings.apiUrl as string | undefined) ?? "http://localhost:3000"
    chrome.tabs.create({ url: `${appUrl}/dashboard` })
  })
}

async function launchFullAudit(url: string, appUrl: string, token: string) {
  const btn = document.getElementById("btn-full-audit") as HTMLButtonElement
  btn.textContent = "Lancement en cours…"
  btn.disabled = true

  try {
    const res = await fetch(`${appUrl}/api/audits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    })

    if (!res.ok) throw new Error("Erreur API")

    const audit = await res.json() as { auditId: string }
    chrome.tabs.create({ url: `${appUrl}/audits/${audit.auditId}` })
  } catch {
    btn.textContent = "Erreur — Réessayer"
    btn.disabled = false
  }
}

function showError(message: string) {
  const loadingEl = document.getElementById("loading")!
  loadingEl.innerHTML = ""
  const div = document.createElement("div")
  div.style.cssText = "color:#ef4444;font-size:13px;padding:20px"
  div.textContent = message
  loadingEl.appendChild(div)
}
