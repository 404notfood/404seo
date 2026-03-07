"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

// ─── Stats ────────────────────────────────────

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => apiClient.getAdminStats(),
    staleTime: 30_000,
  })
}

// ─── Utilisateurs ─────────────────────────────

export function useAdminUsers(params?: { search?: string; page?: number; role?: string; banned?: string }) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => apiClient.getAdminUsers(params),
    staleTime: 30_000,
  })
}

export function usePatchAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: string; isBanned?: boolean } }) =>
      apiClient.patchAdminUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] })
    },
  })
}

// ─── Tenants ──────────────────────────────────

export function useAdminTenants(params?: { plan?: string; suspended?: string; page?: number }) {
  return useQuery({
    queryKey: ["admin", "tenants", params],
    queryFn: () => apiClient.getAdminTenants(params),
    staleTime: 30_000,
  })
}

export function usePatchAdminTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: { plan?: string; isSuspended?: boolean; name?: string }
    }) => apiClient.patchAdminTenant(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] })
    },
  })
}

export function useAdminTenantDetail(id: string) {
  return useQuery({
    queryKey: ["admin", "tenants", id],
    queryFn: () => apiClient.getAdminTenantDetail(id),
    staleTime: 30_000,
    enabled: !!id,
  })
}

export function useTenantFeatures(id: string) {
  return useQuery({
    queryKey: ["admin", "tenants", id, "features"],
    queryFn: () => apiClient.getTenantFeatures(id),
    staleTime: 15_000,
    enabled: !!id,
  })
}

export function useSetTenantFeature(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { feature: string; enabled: boolean; note?: string }) =>
      apiClient.setTenantFeature(tenantId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tenants", tenantId] })
    },
  })
}

export function useDeleteTenantFeature(tenantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (feature: string) => apiClient.deleteTenantFeature(tenantId, feature),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "tenants", tenantId] })
    },
  })
}

// ─── Plans ────────────────────────────────────

export function useAdminPlans() {
  return useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => apiClient.getAdminPlans(),
    staleTime: 60_000,
  })
}

export function useCreateAdminPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.createAdminPlan(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "plans"] })
    },
  })
}

export function useUpdateAdminPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ plan, data }: { plan: string; data: Record<string, unknown> }) =>
      apiClient.updateAdminPlan(plan, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "plans"] })
    },
  })
}

export function useSeedAdminPlans() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.seedAdminPlans(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "plans"] })
    },
  })
}
