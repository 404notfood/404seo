import { useQuery } from "@tanstack/react-query"
import type { InternalLinkView } from "@seo/shared"
import { apiClient } from "@/lib/api-client"

export function useInternalLinks(projectId: string, params: { view: InternalLinkView; q: string; page: number; unlinked: boolean }) {
  return useQuery({ queryKey: ["internal-links", projectId, params], queryFn: () => apiClient.getInternalLinks(projectId, params), staleTime: 30_000 })
}
