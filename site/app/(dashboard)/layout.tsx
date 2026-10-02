// Server Component (pas de "use client") : permet d'exporter la config de route.
// Tout le dashboard + l'admin est rendu DYNAMIQUEMENT (par utilisateur connecte),
// jamais pre-genere en statique au build -> evite les erreurs de pre-render
// (useRef null, BetterAuthError) sur ces pages authentifiees.
export const dynamic = "force-dynamic"

import { DashboardShell } from "@/components/layout/DashboardShell"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isBanned: true, tenant: { select: { isSuspended: true } } },
  })
  if (!user || user.isBanned || user.tenant?.isSuspended) redirect("/login?error=suspended")
  return <DashboardShell>{children}</DashboardShell>
}
