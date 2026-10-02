import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiClient } from "@/lib/api-client"

export function useProjectAnalytics(projectId: string, page = 1) {
  return useQuery({ queryKey: ["project-analytics", projectId, page], queryFn: () => apiClient.getProjectAnalytics(projectId, page), staleTime: 30_000 })
}
export function useAnalyticsProperty(projectId: string, accountId: string, propertyId: string) {
  return useQuery({ queryKey: ["analytics-property", projectId, accountId, propertyId], queryFn: () => apiClient.getAnalyticsProperty(projectId, accountId, propertyId), enabled: !!accountId && !!propertyId, staleTime: 60_000, retry: false })
}
export function useSyncAnalytics(projectId: string) {
  const client = useQueryClient()
  return useMutation({ mutationFn: (data: { googleAccountId: string; propertyId: string; streamId: string }) => apiClient.syncAnalytics(projectId, data),
    onSuccess: data => { void client.invalidateQueries({ queryKey: ["project-analytics", projectId] }); toast.success(`${data.pageCount} page(s) d’entrée GA4 importée(s)`) }, onError: (error: Error) => toast.error(error.message) })
}
export function useMeasureAnalytics(projectId: string, checkName: string) {
  const client = useQueryClient()
  return useMutation({ mutationFn: (days: 7 | 28) => apiClient.measureAnalyticsAction(projectId, checkName, days),
    onSuccess: data => { void client.invalidateQueries({ queryKey: ["project-analytics", projectId] }); toast[data.comparablePages ? "success" : "info"](data.comparablePages ? "Comparaison GA4 enregistrée" : "Aucune page d’entrée comparable dans les deux périodes") }, onError: (error: Error) => toast.error(error.message) })
}
