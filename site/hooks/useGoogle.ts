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

// Sync GBP listings depuis Google
export function useSyncGBPListings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.syncGBPListings(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["local-listings"] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["google-status"] })
      const msg = data.imported > 0
        ? `${data.imported} fiche${data.imported > 1 ? "s" : ""} synchronisée${data.imported > 1 ? "s" : ""}`
        : "Fiches déjà à jour"
      toast.success(msg)
      if (data.errors.length > 0) {
        toast.warning(`${data.errors.length} erreur(s) pendant la sync`)
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur lors de la synchronisation")
    },
  })
}

// Sync reviews depuis Google
export function useSyncGBPReviews(listingId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.syncGBPReviews(listingId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["local-reviews"] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      const msg = data.synced > 0
        ? `${data.synced} avis synchronisé${data.synced > 1 ? "s" : ""}`
        : "Avis déjà à jour"
      toast.success(msg)
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur sync avis")
    },
  })
}

// Sync posts depuis Google
export function useSyncGBPPosts(listingId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.syncGBPPosts(listingId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["local-posts"] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      const msg = data.synced > 0
        ? `${data.synced} post${data.synced > 1 ? "s" : ""} synchronisé${data.synced > 1 ? "s" : ""}`
        : "Posts déjà à jour"
      toast.success(msg)
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur sync posts")
    },
  })
}

// Publier un post sur Google
export function usePublishGooglePost(listingId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { content: string; type?: string; ctaType?: string; ctaUrl?: string; imageUrl?: string }) =>
      apiClient.publishGooglePost(listingId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-posts"] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      toast.success("Post publié sur Google !")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur publication post")
    },
  })
}

// Répondre à un avis sur Google
export function useReplyToGoogleReview(listingId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reviewId, replyText }: { reviewId: string; replyText: string }) =>
      apiClient.replyToGoogleReview(listingId!, reviewId, replyText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-reviews"] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      toast.success("Réponse publiée sur Google !")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur réponse avis")
    },
  })
}

// Supprimer un post sur Google
export function useDeleteGooglePost(listingId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) => apiClient.deleteGooglePost(listingId!, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-posts"] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      toast.success("Post supprimé")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur suppression post")
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
