import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

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
