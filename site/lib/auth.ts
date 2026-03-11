// lib/auth.ts — Configuration BetterAuth (Server-side)
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { organization } from "better-auth/plugins"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ── Envoi d'emails via Resend HTTP API ──
async function sendEmailViaResend(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn("[auth-email] RESEND_API_KEY non configurée, email ignoré:", subject, "→", to)
    return
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "404 SEO <noreply@seo.404notfood.fr>",
        to,
        subject,
        html,
      }),
    })
  } catch (err) {
    console.error("[auth-email] Erreur envoi:", err)
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !!process.env.RESEND_API_KEY,
    sendResetPassword: async ({ user, url }) => {
      await sendEmailViaResend(
        user.email,
        "Réinitialisation de mot de passe — 404 SEO",
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0f172a;color:#f1f5f9;">
          <h1 style="color:#2563eb;">404 SEO</h1>
          <h2>Réinitialisation de mot de passe</h2>
          <p style="color:#94a3b8;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${url}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Réinitialiser</a>
          </div>
          <p style="color:#64748b;font-size:13px;">Ce lien expire dans 1 heure.</p>
        </div>`
      )
    },
  },

  emailVerification: {
    sendOnSignUp: !!process.env.RESEND_API_KEY,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmailViaResend(
        user.email,
        "Vérifiez votre email — 404 SEO",
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0f172a;color:#f1f5f9;">
          <h1 style="color:#2563eb;">404 SEO</h1>
          <h2>Bienvenue !</h2>
          <p style="color:#94a3b8;">Cliquez pour confirmer votre adresse email et activer votre compte.</p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${url}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Vérifier mon email</a>
          </div>
          <p style="color:#64748b;font-size:13px;">Si vous n'avez pas créé de compte, ignorez cet email.</p>
        </div>`
      )
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  plugins: [
    organization({
      sendInvitationEmail: async (data) => {
        console.log("Invitation:", data)
      },
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "MEMBER",
      },
      tenantId: {
        type: "string",
        defaultValue: null,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-créer un Tenant pour chaque nouvel utilisateur
          const slug = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-")
          const uniqueSlug = `${slug}-${Date.now().toString(36)}`

          const tenant = await prisma.tenant.create({
            data: {
              name: user.name || user.email.split("@")[0],
              slug: uniqueSlug,
              plan: "STARTER",
            },
          })

          // Lier l'utilisateur au tenant + rôle ADMIN (propriétaire)
          await prisma.user.update({
            where: { id: user.id },
            data: { tenantId: tenant.id, role: "ADMIN" },
          })
        },
      },
    },
  },

  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET!,
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ...(process.env.NEXT_PUBLIC_APP_URL ? [] : ["http://localhost:3000"]),
  ],
})

export type Auth = typeof auth
