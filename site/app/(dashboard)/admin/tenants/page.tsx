"use client"

import { useState } from "react"
import { useAdminTenants, usePatchAdminTenant } from "@/hooks/useAdmin"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

const PLAN_COLORS: Record<string, string> = {
  STARTER: "#64748b",
  PRO: "#2563eb",
  AGENCY: "#7c3aed",
  ENTERPRISE: "#06b6d4",
}
const PLAN_OPTIONS = ["STARTER", "PRO", "AGENCY", "ENTERPRISE"]

export default function AdminTenantsPage() {
  const [planFilter, setPlanFilter] = useState("")
  const [suspendedFilter, setSuspendedFilter] = useState("")
  const [page, setPage] = useState(1)

  const { data, isLoading } = useAdminTenants({
    plan: planFilter || undefined,
    suspended: suspendedFilter || undefined,
    page,
  })

  const patchTenant = usePatchAdminTenant()

  async function handlePlanChange(id: string, plan: string) {
    try {
      await patchTenant.mutateAsync({ id, data: { plan } })
      toast.success("Plan mis à jour")
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  async function handleSuspendToggle(id: string, isSuspended: boolean) {
    try {
      await patchTenant.mutateAsync({ id, data: { isSuspended } })
      toast.success(isSuspended ? "Tenant suspendu" : "Tenant réactivé")
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Filtres ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 outline-none"
        >
          <option value="">Tous les plans</option>
          {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={suspendedFilter}
          onChange={(e) => { setSuspendedFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 rounded-lg text-sm bg-white border border-slate-200 text-slate-700 outline-none"
        >
          <option value="">Tous les statuts</option>
          <option value="false">Actif</option>
          <option value="true">Suspendu</option>
        </select>
        <span className="text-sm text-slate-500">{data?.total ?? 0} tenant{(data?.total ?? 0) > 1 ? "s" : ""}</span>
      </div>

      {/* ── Tableau ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["Tenant", "Plan", "Utilisateurs", "Audits/mois", "MRR", "Statut", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : (data?.tenants ?? []).map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/admin/tenants/${tenant.id}`} className="hover:underline">
                        <p className="font-medium text-slate-900 truncate max-w-[180px]">{tenant.name}</p>
                        <p className="text-xs text-slate-400">{tenant.slug}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={tenant.plan}
                        onChange={(e) => handlePlanChange(tenant.id, e.target.value)}
                        className="text-xs px-2 py-1 rounded-md font-bold uppercase cursor-pointer outline-none border"
                        style={{
                          background: `${PLAN_COLORS[tenant.plan] ?? "#64748b"}10`,
                          color: PLAN_COLORS[tenant.plan] ?? "#64748b",
                          borderColor: `${PLAN_COLORS[tenant.plan] ?? "#64748b"}30`,
                        }}
                      >
                        {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{tenant.userCount}</td>
                    <td className="px-4 py-3 text-slate-700">{tenant.auditCount}</td>
                    <td className="px-4 py-3 text-slate-700">{tenant.mrr > 0 ? `${tenant.mrr} €` : "—"}</td>
                    <td className="px-4 py-3">
                      {tenant.isSuspended ? (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                          Suspendu
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                          Actif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/tenants/${tenant.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100"
                        >
                          Détail
                        </Link>
                        <button
                          onClick={() => handleSuspendToggle(tenant.id, !tenant.isSuspended)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border"
                          style={tenant.isSuspended
                            ? { background: "#f0fdf4", color: "#16a34a", borderColor: "#bbf7d0" }
                            : { background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}
                        >
                          {tenant.isSuspended ? "Réactiver" : "Suspendre"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!isLoading && !data?.tenants?.length && (
          <p className="text-sm text-slate-400 text-center py-8">Aucun tenant trouvé</p>
        )}
      </div>

      {/* ── Pagination ── */}
      {(data?.pages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg disabled:opacity-30 transition-colors hover:bg-slate-100 text-slate-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-slate-600">
            Page {page} / {data?.pages ?? 1}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data?.pages ?? 1, p + 1))}
            disabled={page === (data?.pages ?? 1)}
            className="p-2 rounded-lg disabled:opacity-30 transition-colors hover:bg-slate-100 text-slate-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
