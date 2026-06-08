// Server Component (pas de "use client") : permet d'exporter la config de route.
// Tout le dashboard + l'admin est rendu DYNAMIQUEMENT (par utilisateur connecte),
// jamais pre-genere en statique au build -> evite les erreurs de pre-render
// (useRef null, BetterAuthError) sur ces pages authentifiees.
export const dynamic = "force-dynamic"

import { DashboardShell } from "@/components/layout/DashboardShell"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardShell>{children}</DashboardShell>
}
