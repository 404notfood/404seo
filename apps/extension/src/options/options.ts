// options/options.ts — Page de configuration de l'extension

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.sync.get(["apiUrl", "apiToken"])
  const apiUrlInput = document.getElementById("api-url") as HTMLInputElement
  const apiTokenInput = document.getElementById("api-token") as HTMLInputElement
  const statusEl = document.getElementById("connection-status") as HTMLDivElement

  if (settings.apiUrl) apiUrlInput.value = settings.apiUrl as string
  if (settings.apiToken) apiTokenInput.value = settings.apiToken as string

  // Test de connexion
  async function testConnection(apiUrl: string, token: string) {
    statusEl.textContent = "Test de connexion…"
    statusEl.className = "status testing"
    try {
      const res = await fetch(`${apiUrl}/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        statusEl.textContent = "✓ Connexion réussie"
        statusEl.className = "status ok"
      } else {
        statusEl.textContent = `✗ Erreur ${res.status}`
        statusEl.className = "status error"
      }
    } catch {
      statusEl.textContent = "✗ Impossible de contacter l'API"
      statusEl.className = "status error"
    }
  }

  document.getElementById("save-btn")!.addEventListener("click", async () => {
    const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "")
    const apiToken = apiTokenInput.value.trim()

    await chrome.storage.sync.set({ apiUrl, apiToken })

    const successEl = document.getElementById("success-msg")!
    successEl.style.display = "block"
    setTimeout(() => { successEl.style.display = "none" }, 3000)

    if (apiUrl) await testConnection(apiUrl, apiToken)
  })

  document.getElementById("test-btn")!.addEventListener("click", async () => {
    const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "")
    const apiToken = apiTokenInput.value.trim()
    if (apiUrl) await testConnection(apiUrl, apiToken)
  })

  // Test initial si déjà configuré
  if (settings.apiUrl) {
    await testConnection(settings.apiUrl as string, (settings.apiToken as string) ?? "")
  }
})
