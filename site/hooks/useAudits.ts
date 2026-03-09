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

export function useLaunchAudit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: LaunchAuditInput) => apiClient.launchAudit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audits"] })
      toast.success("Audit lancé avec succès !")
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
