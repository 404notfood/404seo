import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type CreateListingInput, type CreatePostInput } from "@/lib/api-client"
import { toast } from "sonner"

export function useLocalDashboard() {
  return useQuery({
    queryKey: ["local-dashboard"],
    queryFn: () => apiClient.getLocalDashboard(),
    staleTime: 60_000,
  })
}

export function useLocalListings() {
  return useQuery({
    queryKey: ["local-listings"],
    queryFn: () => apiClient.getLocalListings(),
    staleTime: 60_000,
  })
}

export function useLocalReviews(listingId: string | null) {
  return useQuery({
    queryKey: ["local-reviews", listingId],
    queryFn: () => apiClient.getLocalReviews(listingId!),
    enabled: !!listingId,
    staleTime: 30_000,
  })
}

export function useLocalPosts(listingId: string | null) {
  return useQuery({
    queryKey: ["local-posts", listingId],
    queryFn: () => apiClient.getLocalPosts(listingId!),
    enabled: !!listingId,
    staleTime: 30_000,
  })
}

export function useLocalRankings(listingId: string | null) {
  return useQuery({
    queryKey: ["local-rankings", listingId],
    queryFn: () => apiClient.getLocalRankings(listingId!),
    enabled: !!listingId,
    staleTime: 60_000,
  })
}

export function useCreateListing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateListingInput) => apiClient.createListing(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-listings"] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      toast.success("Fiche créée avec succès !")
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erreur lors de la création")
    },
  })
}

export function useReplyToReview(listingId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reviewId, replyText }: { reviewId: string; replyText: string }) =>
      apiClient.replyToReview(listingId!, reviewId, replyText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-reviews", listingId] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      toast.success("Réponse publiée !")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAISuggestReply(listingId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reviewId: string) => apiClient.aiSuggestReply(listingId!, reviewId),
    onSuccess: (_, reviewId) => {
      queryClient.invalidateQueries({ queryKey: ["local-reviews", listingId] })
      toast.success("Suggestion IA générée !")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useCreatePost(listingId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePostInput) => apiClient.createPost(listingId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-posts", listingId] })
      queryClient.invalidateQueries({ queryKey: ["local-dashboard"] })
      toast.success("Post créé avec succès !")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
