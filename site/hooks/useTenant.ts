import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type UpdateBrandingInput } from "@/lib/api-client"
import { toast } from "sonner"

export function useTenant() {
  return useQuery({
    queryKey: ["tenant"],
    queryFn: () => apiClient.getTenant(),
    staleTime: 60_000,
  })
}

export function useUpdateBranding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateBrandingInput) => apiClient.updateBranding(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant"] })
      queryClient.invalidateQueries({ queryKey: ["me"] })
      toast.success("Branding mis à jour")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur lors de la mise à jour")
    },
  })
}
