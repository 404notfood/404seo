export function allowedOrigins(): string[] {
  const production = process.env.NODE_ENV === "production"
  return [...new Set([
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
    ...(production ? ["https://seo.404notfood.fr"] : ["http://localhost:3000"]),
    ...(process.env.CHROME_EXTENSION_ORIGINS ?? "").split(",").map((origin) => origin.trim()),
  ].filter((origin): origin is string => !!origin))]
}

export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins().includes(origin)
}

export function isPublicApiRoute(method: string, rawUrl: string): boolean {
  const path = rawUrl.split("?")[0]
  return (method === "GET" && (path === "/health" || path === "/api/google/callback" ||
    /^\/api\/reports\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(path))) ||
    (method === "POST" && path === "/api/billing/webhook")
}

export function isCrossSiteMutation(method: string, origin: string | undefined, fetchSite: string | undefined, bearer: boolean): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method) || bearer) return false
  if (origin) return !isAllowedOrigin(origin)
  // Native clients without browser metadata can authenticate with bearer tokens.
  return fetchSite === "cross-site"
}
