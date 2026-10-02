// lib/auth-client.ts — Client BetterAuth (Client-side)
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
})

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
} = authClient
