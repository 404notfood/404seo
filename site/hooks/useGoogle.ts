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

// Déconnecter tous les comptes Google
export function useDisconnectGoogle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.disconnectGoogle(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-status"] })
      queryClient.invalidateQueries({ queryKey: ["local-listings"] })
      toast.success("Tous les comptes Google déconnectés")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur lors de la déconnexion")
    },
  })
}

// Déconnecter un compte Google spécifique
export function useDisconnectGoogleAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: string) => apiClient.disconnectGoogleAccount(accountId),
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

// Délier Google d'une fiche GBP spécifique
export function useDisconnectGoogleListing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listingId: string) => apiClient.disconnectGoogleListing(listingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-listings"] })
      toast.success("Fiche déliée de Google")
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
