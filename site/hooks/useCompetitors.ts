import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { toast } from "sonner"

export function useCompetitors(projectId?: string | null) {
  return useQuery({
    queryKey: ["competitors", projectId],
    queryFn: () => apiClient.getCompetitors(projectId),
    staleTime: 60_000,
  })
}

export function useAddCompetitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { domain: string; label?: string; projectId?: string }) =>
      apiClient.addCompetitor(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitors"] })
      toast.success("Concurrent ajouté")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteCompetitor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteCompetitor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competitors"] })
      toast.success("Concurrent supprimé")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
