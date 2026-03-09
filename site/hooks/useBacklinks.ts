import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type AddBacklinkInput } from "@/lib/api-client"
import { toast } from "sonner"

export function useBacklinks(params?: { projectId?: string | null; domain?: string; page?: number }) {
  return useQuery({
    queryKey: ["backlinks", params],
    queryFn: () => apiClient.getBacklinks(params ?? {}),
    staleTime: 60_000,
  })
}

export function useFetchBacklinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ domain, projectId }: { domain: string; projectId?: string }) =>
      apiClient.fetchBacklinks(domain, projectId),
    onSuccess: () => {
      toast.success("Import lancé — les backlinks apparaîtront dans quelques secondes")
      setTimeout(() => qc.invalidateQueries({ queryKey: ["backlinks"] }), 15_000)
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useAddBacklink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddBacklinkInput) => apiClient.addBacklink(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlinks"] })
      toast.success("Backlink ajouté")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}

export function useDeleteBacklink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteBacklink(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backlinks"] })
      toast.success("Backlink supprimé")
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
