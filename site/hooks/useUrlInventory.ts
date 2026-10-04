import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { UrlInventoryMode } from "@seo/shared"
import { apiClient } from "@/lib/api-client"

export function useUrlInventory(projectId: string, params: { mode: UrlInventoryMode; q: string; page: number }) {
  return useQuery({ queryKey: ["url-inventory", projectId, params], queryFn: () => apiClient.getUrlInventory(projectId, params), staleTime: 30_000 })
}

export function useSyncSitemaps(projectId: string) {
  const client = useQueryClient()
  return useMutation({ mutationFn: (sitemapUrl?: string) => apiClient.syncSitemaps(projectId, sitemapUrl),
    onSuccess: result => { void client.invalidateQueries({ queryKey: ["url-inventory", projectId] }); toast[result.partial ? "info" : "success"](`${result.pageCount} URL(s) importée(s)${result.partial ? " · couverture partielle" : ""}`) },
    onError: (error: Error) => toast.error(error.message) })
}
