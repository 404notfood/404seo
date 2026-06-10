// popup/popup.ts

import type { PageAnalysisResponse } from "../content/content-script"

// URL du dashboard. L'extension s'authentifie via le cookie de session du site :
// l'utilisateur se connecte une fois sur le dashboard, puis tout fonctionne.
const APP_URL = "https://seo.404notfood.fr"

// Met à jour le badge "Connecté/Non connecté" en vérifiant la session réelle
// via /api/me (cookie de session). Best-effort : silencieux si réseau indisponible.
async function updateConnectionBadge() {
  const badge = document.getElementById("plan-badge")
  if (!badge) return
  try {
    const res = await fetch(`${APP_URL}/api/me`, { credentials: "include" })
    if (res.ok) {
      badge.textContent = "Connecté"
      badge.style.background = "#10b981"
    } else {
      badge.textContent = "Non connecté"
      badge.style.background = "#94a3b8"
    }
  } catch {
    // Réseau indisponible : on n'affiche rien de plus.
  }
}

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

  // Badge de connexion : vérifie la session réelle (cookie du dashboard ou token).
  void updateConnectionBadge()

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

  // Bouton audit complet — lance directement l'audit de l'URL courante.
  document.getElementById("btn-full-audit")!.addEventListener("click", async () => {
    await launchFullAudit(data.url)
  })

  // Bouton dashboard
  document.getElementById("btn-open-dashboard")!.addEventListener("click", () => {
    chrome.tabs.create({ url: `${APP_URL}/dashboard` })
  })
}

async function launchFullAudit(url: string) {
  const btn = document.getElementById("btn-full-audit") as HTMLButtonElement
  const originalText = btn.textContent
  btn.textContent = "Lancement en cours…"
  btn.disabled = true

  try {
    const res = await fetch(`${APP_URL}/api/audits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // credentials:include → envoie le cookie de session du dashboard. L'utilisateur
      // doit être connecté sur seo.404notfood.fr (sinon on l'envoie vers le login).
      credentials: "include",
      body: JSON.stringify({ url }),
    })

    // Non authentifié : on ouvre le login du dashboard plutôt que d'échouer.
    if (res.status === 401) {
      chrome.tabs.create({ url: `${APP_URL}/login?from=extension` })
      btn.textContent = originalText
      btn.disabled = false
      return
    }

    if (!res.ok) throw new Error("Erreur API")

    const audit = await res.json() as { auditId: string }
    chrome.tabs.create({ url: `${APP_URL}/audits/${audit.auditId}` })
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
