"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
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

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem(STORAGE_KEY)
  })

  const { data: projects } = useProjects()

  // Auto-reset si le projet stocké n'existe plus
  useEffect(() => {
    if (!projects) return
    if (activeProjectId && !projects.find((p) => p.id === activeProjectId)) {
      setActiveProjectIdState(null)
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [projects, activeProjectId])

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectIdState(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const activeProject = projects?.find((p) => p.id === activeProjectId) ?? null

  return (
    <ProjectContext.Provider value={{ activeProjectId, setActiveProjectId, activeProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useActiveProject() {
  return useContext(ProjectContext)
}
