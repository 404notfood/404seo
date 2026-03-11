import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type LaunchAuditInput } from "@/lib/api-client"
import { toast } from "sonner"

export function useAuditStats(projectId?: string | null) {
  return useQuery({
    queryKey: ["audits", "stats", projectId ?? null],
    queryFn: () => apiClient.getAuditStats(projectId),
    staleTime: 30_000,
  })
}

export function useAudits(projectId?: string | null) {
  return useQuery({
    queryKey: ["audits", projectId ?? null],
    queryFn: () => apiClient.getAudits(projectId),
    // Poll toutes les 5s tant qu'un audit est en cours
    refetchInterval: (query) => {
      const audits = query.state.data
      if (!audits) return false
      const hasRunning = audits.some((a) =>
        ["PENDING", "CRAWLING", "ANALYZING", "SCORING", "GENERATING_REPORT"].includes(a.status)
      )
      return hasRunning ? 5000 : false
    },
  })
}

export function useAudit(id: string) {
  return useQuery({
    queryKey: ["audit", id],
    queryFn: () => apiClient.getAudit(id),
    // Poll toutes les 3s tant que l'audit n'est pas terminé
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && ["COMPLETED", "FAILED", "CANCELLED"].includes(status) ? false : 3000
    },
  })
}

export function useLaunchAudit(opts?: { onAuditCreated?: (auditId: string) => void }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: LaunchAuditInput) => apiClient.launchAudit(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["audits"] })
      toast.success("Audit lancé avec succès !")
      opts?.onAuditCreated?.(data.auditId)
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur lors du lancement")
    },
  })
}

export function useAuditBreakdown(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["audit", id, "breakdown"],
    queryFn: () => apiClient.getAuditBreakdown(id),
    enabled,
    staleTime: 60_000,
  })
}

export function useDeleteAudit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteAudit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audits"] })
      toast.success("Audit supprimé")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}
