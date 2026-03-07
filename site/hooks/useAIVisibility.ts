import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type CheckVisibilityInput } from "@/lib/api-client"
import { toast } from "sonner"

export function useAIVisibility(params?: { domain?: string; engine?: string }) {
  return useQuery({
    queryKey: ["ai-visibility", params],
    queryFn: () => apiClient.getAIVisibility(params),
    staleTime: 60_000,
  })
}

export function useCheckAIVisibility() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CheckVisibilityInput) => apiClient.checkAIVisibility(data),
    onSuccess: () => {
      toast.success("Vérification IA lancée — résultats disponibles dans quelques secondes")
      setTimeout(() => qc.invalidateQueries({ queryKey: ["ai-visibility"] }), 15_000)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteAICheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteAICheck(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-visibility"] }),
    onError: (err: Error) => toast.error(err.message),
  })
}
