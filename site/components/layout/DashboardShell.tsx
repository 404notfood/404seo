"use client"

import { Sidebar } from "@/components/layout/Sidebar"
import { ProjectProvider } from "@/contexts/ProjectContext"

export function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProjectProvider>
      {/* items-start : permet à la sidebar `sticky top-0 h-screen` de rester
          collée en haut pendant que le contenu de <main> défile (retour testeurs). */}
      <div className="flex min-h-screen items-start bg-slate-100 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </ProjectProvider>
  )
}
