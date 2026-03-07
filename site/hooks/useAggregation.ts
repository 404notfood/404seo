import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export function useIssues(params?: { category?: string; status?: string; priority?: string; page?: number; projectId?: string | null }) {
  return useQuery({
    queryKey: ["issues", params],
    queryFn: () => apiClient.getIssues(params),
    staleTime: 30_000,
  })
}

export function usePerformanceOverview(projectId?: string | null) {
  return useQuery({
    queryKey: ["performance-overview", projectId ?? null],
    queryFn: () => apiClient.getPerformanceOverview(projectId),
    staleTime: 60_000,
  })
}

export function useOnPageOverview(projectId?: string | null) {
  return useQuery({
    queryKey: ["on-page-overview", projectId ?? null],
    queryFn: () => apiClient.getOnPageOverview(projectId),
    staleTime: 60_000,
  })
}

export function useContentOverview(params?: { thin?: boolean; noMeta?: boolean; noH1?: boolean; page?: number; projectId?: string | null }) {
  return useQuery({
    queryKey: ["content-overview", params],
    queryFn: () => apiClient.getContentOverview(params),
    staleTime: 60_000,
  })
}

export function useStatsTimeline(projectId?: string | null) {
  return useQuery({
    queryKey: ["stats-timeline", projectId ?? null],
    queryFn: () => apiClient.getStatsTimeline(projectId),
    staleTime: 60_000,
  })
}

export function useOptimization(projectId?: string | null) {
  return useQuery({
    queryKey: ["optimization", projectId ?? null],
    queryFn: () => apiClient.getOptimization(projectId),
    staleTime: 60_000,
  })
}
