"use client"

import { createContext, useContext, useSyncExternalStore, useEffect, useCallback, type ReactNode } from "react"
import { useProjects } from "@/hooks/useProjects"
import type { Project } from "@/lib/api-client"

interface ProjectContextValue {
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
  activeProject: Project | null
}

const ProjectContext = createContext<ProjectContextValue>({
  activeProjectId: null,
  setActiveProjectId: () => {},
  activeProject: null,
})

const STORAGE_KEY = "seo-active-project"
const PROJECT_CHANGED = "seo-project-changed"

function subscribeProject(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(PROJECT_CHANGED, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(PROJECT_CHANGED, onChange)
  }
}

function readStoredProject() { return localStorage.getItem(STORAGE_KEY) }
function serverProject() { return null }

export function ProjectProvider({ children }: { children: ReactNode }) {
  const activeProjectId = useSyncExternalStore(subscribeProject, readStoredProject, serverProject)

  const { data: projects } = useProjects()

  // Auto-reset si le projet stocké n'existe plus
  useEffect(() => {
    if (!projects) return
    if (activeProjectId && !projects.find((p) => p.id === activeProjectId)) {
      localStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new Event(PROJECT_CHANGED))
    }
  }, [projects, activeProjectId])

  const setActiveProjectId = useCallback((id: string | null) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    window.dispatchEvent(new Event(PROJECT_CHANGED))
  }, [])

  const activeProject = projects?.find((p) => p.id === activeProjectId) ?? null

  return (
    <ProjectContext.Provider value={{ activeProjectId: projects && !activeProject ? null : activeProjectId, setActiveProjectId, activeProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useActiveProject() {
  return useContext(ProjectContext)
}
