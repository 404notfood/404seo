"use client"

import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Sidebar } from "@/components/layout/Sidebar"
import { ProjectProvider } from "@/contexts/ProjectContext"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <ProjectProvider>
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background px-4 py-3 md:hidden">
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogTrigger asChild><Button variant="outline" size="icon" aria-label="Ouvrir la navigation"><Menu className="size-5" /></Button></DialogTrigger>
          <DialogContent showCloseButton={false} className="left-0 top-0 h-dvh w-[min(320px,90vw)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-slate-900 p-0 sm:max-w-none">
            <DialogTitle className="sr-only">Navigation du projet</DialogTitle>
            <DialogDescription className="sr-only">Accéder aux outils SEO et aux paramètres.</DialogDescription>
            <DialogClose asChild><Button variant="ghost" size="icon" className="absolute right-3 top-3 z-10 text-white hover:bg-white/10 hover:text-white" aria-label="Fermer la navigation"><X className="size-5" /></Button></DialogClose>
            <div className="[&>aside]:h-dvh [&>aside]:w-full" onClick={event => {
              if (event.target instanceof Element && event.target.closest("a[href]")) setMenuOpen(false)
            }}><Sidebar /></div>
          </DialogContent>
        </Dialog>
        <span className="font-semibold">404 SEO</span>
      </div>
      {/* items-start : permet à la sidebar `sticky top-0 h-screen` de rester
          collée en haut pendant que le contenu de <main> défile (retour testeurs). */}
      <div className="flex min-h-screen items-start bg-slate-100 dark:bg-slate-950">
        <div className="hidden shrink-0 md:sticky md:top-0 md:block"><Sidebar /></div>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </ProjectProvider>
  )
}
