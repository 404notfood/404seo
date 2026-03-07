"use client"

import { Sidebar } from "@/components/layout/Sidebar"
import { ProjectProvider } from "@/contexts/ProjectContext"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProjectProvider>
      <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 overflow-auto min-w-0">{children}</main>
      </div>
    </ProjectProvider>
  )
}
