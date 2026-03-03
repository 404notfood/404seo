import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type LaunchAuditInput } from "@/lib/api-client"

export function useAuditStats() {
  return useQuery({
    queryKey: ["audits", "stats"],
    queryFn: () => apiClient.getAuditStats(),
    staleTime: 30_000,
  })
}
import { toast } from "sonner"

export function useAudits() {
  return useQuery({
    queryKey: ["audits"],
    queryFn: () => apiClient.getAudits(),
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
