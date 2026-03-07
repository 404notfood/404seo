// lib/googleOAuth.ts — Client OAuth2 Google réutilisable
import { google } from "googleapis"
import { prisma } from "./prisma"

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
]

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  )
}

// Retourne un client OAuth2 configuré avec les credentials du tenant.
// Rafraîchit le token automatiquement si expiré.
export async function getAuthenticatedClient(tenantId: string) {
  const account = await prisma.googleAccount.findUnique({
    where: { tenantId },
  })
  if (!account) {
    throw new Error("Aucun compte Google connecté pour ce tenant")
  }

  const auth = getOAuthClient()
  auth.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry.getTime(),
  })

  // Rafraîchir si le token expire dans moins de 5 minutes
  if (account.tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
    const { credentials } = await auth.refreshAccessToken()
    await prisma.googleAccount.update({
      where: { tenantId },
      data: {
        accessToken: credentials.access_token!,
        tokenExpiry: new Date(credentials.expiry_date!),
      },
    })
    auth.setCredentials(credentials)
  }

  return auth
}
