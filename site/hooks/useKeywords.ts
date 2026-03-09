import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export function useAuditKeywords(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["audit-keywords", id],
    queryFn: () => apiClient.getAuditKeywords(id),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
