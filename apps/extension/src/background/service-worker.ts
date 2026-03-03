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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "options.html" })
  }
})
