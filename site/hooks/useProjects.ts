import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient, type CreateProjectInput } from "@/lib/api-client"
import { toast } from "sonner"

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiClient.getProjects(),
  })
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateProjectInput) => apiClient.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success("Projet créé !")
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success("Projet supprimé")
    },
  })
}
