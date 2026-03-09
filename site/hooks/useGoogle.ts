import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { toast } from "sonner"

export function useGoogleStatus() {
  return useQuery({
    queryKey: ["google-status"],
    queryFn: () => apiClient.getGoogleStatus(),
    staleTime: 30_000,
  })
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.disconnectGoogle(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-status"] })
      queryClient.invalidateQueries({ queryKey: ["local-listings"] })
      toast.success("Compte Google déconnecté")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur lors de la déconnexion")
    },
  })
}

export function useGA4Data(propertyId: string | null) {
  return useQuery({
    queryKey: ["ga4-data", propertyId],
    queryFn: () => apiClient.getGA4Data(propertyId!),
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
  })
}

export function useGSCData(siteUrl: string | null) {
  return useQuery({
    queryKey: ["gsc-data", siteUrl],
    queryFn: () => apiClient.getGSCData(siteUrl!),
    enabled: !!siteUrl,
    staleTime: 5 * 60_000,
  })
}
