// background/service-worker.ts — Badge de score sur l'icône (Manifest V3)

chrome.runtime.onMessage.addListener((message, _sender) => {
  if (message.type === "UPDATE_BADGE") {
    const score = message.score as number
    const tabId = message.tabId as number

    const color =
      score >= 70 ? "#10b981" :
      score >= 40 ? "#f59e0b" :
      "#ef4444"

    chrome.action.setBadgeText({ text: String(score), tabId })
    chrome.action.setBadgeBackgroundColor({ color, tabId })
  }
})

// Réinitialiser le badge quand on change d'onglet
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url?.startsWith("http")) {
    chrome.action.setBadgeText({ text: "", tabId })
  }
})

// URL du dashboard (l'extension s'authentifie via le cookie de session du site).
const APP_URL = "https://seo.404notfood.fr"

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // À l'installation, on invite l'utilisateur à se connecter au dashboard :
    // une fois loggé, l'extension réutilise automatiquement sa session (cookie).
    chrome.tabs.create({ url: `${APP_URL}/login?from=extension` })
  }
})
