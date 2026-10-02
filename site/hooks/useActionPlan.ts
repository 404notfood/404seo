import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { SeoActionStatus } from "@seo/shared"
import { apiClient } from "@/lib/api-client"

export function useActionPlan(projectId: string | null) {
  return useQuery({ queryKey: ["action-plan", projectId], queryFn: () => apiClient.getActionPlan(projectId!), enabled: !!projectId, staleTime: 30_000 })
}

export function useSearchConsoleProperties(projectId: string, accountId: string) {
  return useQuery({ queryKey: ["search-console-properties", projectId, accountId], queryFn: () => apiClient.getSearchConsoleProperties(projectId, accountId), enabled: !!accountId, staleTime: 60_000, retry: false })
}

export function useSyncSearchConsole(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { googleAccountId: string; propertyUrl: string }) => apiClient.syncSearchConsole(projectId, data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["action-plan", projectId] })
      toast.success(`${data.pageCount} page(s) Search Console importée(s)`)
    }, onError: (error: Error) => toast.error(error.message),
  })
}

export function useUpdateSeoAction(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ checkName, ...data }: { checkName: string; status: Exclude<SeoActionStatus, "VERIFIED">; note?: string }) => apiClient.updateSeoAction(projectId, checkName, data),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["action-plan", projectId] }); toast.success("Action enregistrée") },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useVerifySeoActions(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.verifySeoActions(projectId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["action-plan", projectId] })
      if (result.verified.length) toast.success(`${result.verified.length} correction(s) vérifiée(s)`)
      if (result.reopened.length) toast.warning(`${result.reopened.length} action(s) rouverte(s) : régression détectée`)
      if (result.pending.length) toast.info(result.pending[0].reason)
      if (!result.verified.length && !result.reopened.length && !result.pending.length) toast.info("Aucune correction en attente de vérification")
    }, onError: (error: Error) => toast.error(error.message),
  })
}
