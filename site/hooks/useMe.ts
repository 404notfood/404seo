import { useQuery } from "@tanstack/react-query"
import { apiClient, type UserMe } from "@/lib/api-client"

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.getMe(),
    staleTime: 5 * 60 * 1000, // 5 min
    retry: 1,
  })
}

export function useRole() {
  const { data: user } = useMe()
  return {
    role: user?.role ?? "GUEST",
    plan: user?.tenant?.plan ?? "STARTER",
    isAdmin: user?.role === "ADMIN",
    isMember: user?.role === "ADMIN" || user?.role === "MEMBER",
    isGuest: user?.role === "GUEST",
  }
}
