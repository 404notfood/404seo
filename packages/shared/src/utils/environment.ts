export function assertProductionEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.length < 32 || /^(change|your|replace|<)/i.test(secret)) {
    throw new Error("BETTER_AUTH_SECRET doit être un secret aléatoire de 32 caractères minimum")
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant")
  for (const key of ["BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL"] as const) {
    const value = process.env[key]
    if (!value || new URL(value).origin !== "https://seo.404notfood.fr") {
      throw new Error(`${key} doit utiliser https://seo.404notfood.fr en production`)
    }
  }
}
