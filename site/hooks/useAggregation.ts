import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export function useIssues(params?: { category?: string; status?: string; priority?: string; page?: number }) {
  return useQuery({
    queryKey: ["issues", params],
    queryFn: () => apiClient.getIssues(params),
    staleTime: 30_000,
  })
}

export function usePerformanceOverview() {
  return useQuery({
    queryKey: ["performance-overview"],
    queryFn: () => apiClient.getPerformanceOverview(),
    staleTime: 60_000,
  })
}

export function useOnPageOverview() {
  return useQuery({
    queryKey: ["on-page-overview"],
    queryFn: () => apiClient.getOnPageOverview(),
    staleTime: 60_000,
  })
}

export function useContentOverview(params?: { thin?: boolean; noMeta?: boolean; noH1?: boolean; page?: number }) {
  return useQuery({
    queryKey: ["content-overview", params],
    queryFn: () => apiClient.getContentOverview(params),
    staleTime: 60_000,
  })
}

export function useStatsTimeline() {
  return useQuery({
    queryKey: ["stats-timeline"],
    queryFn: () => apiClient.getStatsTimeline(),
    staleTime: 60_000,
  })
}

export function useOptimization() {
  return useQuery({
    queryKey: ["optimization"],
    queryFn: () => apiClient.getOptimization(),
    staleTime: 60_000,
  })
}
