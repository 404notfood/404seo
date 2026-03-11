"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type ScheduledAudit } from "@/lib/api-client"
import { useProjects } from "@/hooks/useProjects"
import { useActiveProject } from "@/contexts/ProjectContext"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useState } from "react"
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Pause,
  Play,
  CalendarDays,
} from "lucide-react"
import { formatDistanceToNow } from "@/lib/date"

export default function ScheduledAuditsPage() {
  const { activeProjectId } = useActiveProject()
  const queryClient = useQueryClient()
  const { data: projects } = useProjects()
  const { data: schedules, isLoading } = useQuery({
    queryKey: ["scheduled-audits"],
    queryFn: () => apiClient.getScheduledAudits(),
  })

  const [selectedProject, setSelectedProject] = useState("")
  const [frequency, setFrequency] = useState("weekly")

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createScheduledAudit({
        projectId: selectedProject,
        frequency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-audits"] })
      toast.success("Audit planifié créé")
      setSelectedProject("")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.updateScheduledAudit(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-audits"] })
      toast.success("Mis à jour")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteScheduledAudit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-audits"] })
      toast.success("Planification supprimée")
    },
  })

  // Projets sans schedule actif
  const scheduledProjectIds = new Set(schedules?.filter((s) => s.isActive).map((s) => s.projectId) ?? [])
  const availableProjects = projects?.filter((p) => !scheduledProjectIds.has(p.id)) ?? []

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a" }}>
            <CalendarDays className="inline h-6 w-6 mr-2" style={{ color: "#2563eb" }} />
            Audits planifiés
          </h1>
          <p className="text-sm text-slate-400 mt-1">Programmez des audits automatiques récurrents</p>
        </div>
      </div>

      {/* Formulaire de création */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Programmer un nouvel audit</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Projet</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">Sélectionner un projet…</option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.domain}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Fréquence</label>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuel</option>
            </select>
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!selectedProject || createMutation.isPending}
            className="btn-glow"
            style={{ background: "#2563eb" }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {createMutation.isPending ? "Création…" : "Planifier"}
          </Button>
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : !schedules?.length ? (
        <div className="text-center py-16">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-400">Aucun audit planifié</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{s.project.name}</p>
                  <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs">
                    {s.isActive ? "Actif" : "Pausé"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-400 truncate">{s.project.domain}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {s.frequency === "weekly" ? "Hebdomadaire" : "Mensuel"}
                  </span>
                  {s.nextRunAt && (
                    <span>Prochain : {new Date(s.nextRunAt).toLocaleDateString("fr-FR")}</span>
                  )}
                  {s.lastRunAt && (
                    <span>Dernier : {formatDistanceToNow(s.lastRunAt)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })}
                >
                  {s.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => deleteMutation.mutate(s.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
