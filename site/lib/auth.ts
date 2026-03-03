// lib/auth.ts — Configuration BetterAuth (Server-side)
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { organization } from "better-auth/plugins"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
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

  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET!,
})

export type Auth = typeof auth
