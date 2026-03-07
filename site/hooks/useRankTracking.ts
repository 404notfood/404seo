import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type AddKeywordInput } from "@/lib/api-client"
import { toast } from "sonner"

export function useRankTracking(projectId?: string | null) {
  return useQuery({
    queryKey: ["rank-tracking", projectId],
    queryFn: () => apiClient.getRankTracking(projectId),
    staleTime: 60_000,
    refetchInterval: false,
  })
}

export function useAddKeyword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddKeywordInput) => apiClient.addKeyword(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rank-tracking"] })
      toast.success("Mot-clé ajouté")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteKeyword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteKeyword(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rank-tracking"] })
      toast.success("Mot-clé supprimé")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCheckKeywordPosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, domain }: { id: string; domain?: string }) =>
      apiClient.checkKeywordPosition(id, domain),
    onSuccess: () => {
      toast.success("Vérification lancée en arrière-plan")
      // Rafraîchir après 30s
      setTimeout(() => qc.invalidateQueries({ queryKey: ["rank-tracking"] }), 30_000)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCheckAllPositions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, domain }: { projectId?: string; domain?: string }) =>
      apiClient.checkAllPositions(projectId, domain),
    onSuccess: (_, vars) => {
      toast.success("Vérification de toutes les positions lancée")
      setTimeout(() => qc.invalidateQueries({ queryKey: ["rank-tracking"] }), 60_000)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
