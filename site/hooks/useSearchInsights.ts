import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import { toast } from "sonner"
import type { SearchInsightMode } from "@seo/shared"
import { apiClient } from "@/lib/api-client"

export function useSearchInsights(projectId: string, params: { q: string; mode: SearchInsightMode; page: number }) {
  return useQuery({ queryKey: ["search-insights", projectId, params], queryFn: () => apiClient.getSearchInsights(projectId, params), staleTime: 30_000, placeholderData: keepPreviousData })
}

export function useMeasureSeoAction(projectId: string, checkName: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (days: 7 | 28) => apiClient.measureSeoAction(projectId, checkName, days),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["action-plan", projectId] })
      if (data.comparablePages) toast.success(`Comparaison enregistrée sur ${data.comparablePages} page(s)`)
      else toast.info("Aucune page observée dans les deux périodes : évolution non calculable.")
    }, onError: (error: Error) => toast.error(error.message),
  })
}
