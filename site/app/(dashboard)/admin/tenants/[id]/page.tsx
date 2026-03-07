"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useAdminTenantDetail, usePatchAdminTenant, useSetTenantFeature, useDeleteTenantFeature } from "@/hooks/useAdmin"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronLeft, RotateCcw } from "lucide-react"
import { toast } from "sonner"

const PLAN_COLORS: Record<string, string> = {
  STARTER: "#64748b",
  PRO: "#2563eb",
  AGENCY: "#7c3aed",
  ENTERPRISE: "#06b6d4",
}
const PLAN_OPTIONS = ["STARTER", "PRO", "AGENCY", "ENTERPRISE"]

function FeatureToggle({
  featureKey,
  label,
  planDefault,
  override,
  enabled,
  tenantId,
}: {
  featureKey: string
  label: string
  planDefault: boolean
  override: boolean | null
  enabled: boolean
  tenantId: string
}) {
  const setFeature = useSetTenantFeature(tenantId)
  const deleteFeature = useDeleteTenantFeature(tenantId)
  const [note, setNote] = useState("")

  async function handleToggle(newEnabled: boolean) {
    try {
      await setFeature.mutateAsync({ feature: featureKey, enabled: newEnabled, note: note || undefined })
      toast.success(`Feature "${featureKey}" ${newEnabled ? "activée" : "désactivée"}`)
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  async function handleReset() {
    try {
      await deleteFeature.mutateAsync(featureKey)
      toast.success("Override supprimé — défaut plan restauré")
    } catch {
      toast.error("Erreur lors de la suppression")
    }
  }

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-400 font-mono">{featureKey}</p>
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
            planDefault
              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : "bg-slate-100 text-slate-500 border-slate-200"
          }`}
        >
          {planDefault ? "Inclus" : "Exclu"}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {override !== null ? (
          <div className="flex items-center justify-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                override
                  ? "bg-cyan-50 text-cyan-700 border-cyan-100"
                  : "bg-red-50 text-red-600 border-red-100"
              }`}
            >
              {override ? "ON" : "OFF"}
            </span>
            <button
              onClick={handleReset}
              title="Supprimer l'override"
              className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
            enabled
              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : "bg-red-50 text-red-600 border-red-100"
          }`}
        >
          {enabled ? "Actif" : "Inactif"}
        </span>
      </td>
      <td className="px-4 py-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optionnel)"
          className="w-full text-xs px-2 py-1.5 rounded-md bg-white border border-slate-200 text-slate-700 placeholder:text-slate-300 outline-none focus:border-blue-300"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={() => handleToggle(true)}
            disabled={enabled && override === true}
            className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors disabled:opacity-30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100"
          >
            ON
          </button>
          <button
            onClick={() => handleToggle(false)}
            disabled={!enabled && override === false}
            className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors disabled:opacity-30 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100"
          >
            OFF
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: tenant, isLoading } = useAdminTenantDetail(id)
  const patchTenant = usePatchAdminTenant()

  async function handlePlanChange(plan: string) {
    try {
      await patchTenant.mutateAsync({ id, data: { plan } })
      toast.success("Plan mis à jour")
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  async function handleSuspendToggle() {
    if (!tenant) return
    try {
      await patchTenant.mutateAsync({ id, data: { isSuspended: !tenant.isSuspended } })
      toast.success(tenant.isSuspended ? "Tenant réactivé" : "Tenant suspendu")
    } catch {
      toast.error("Erreur lors de la mise à jour")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!tenant) return <p className="text-slate-500">Tenant introuvable</p>

  return (
    <div className="space-y-6">
      {/* ── Retour + Header ── */}
      <div>
        <Link href="/admin/tenants" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Retour aux tenants
        </Link>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-slate-900">{tenant.name}</h2>
                {tenant.isSuspended && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                    Suspendu
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400 font-mono">{tenant.slug}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
                <span>{tenant.userCount} utilisateur{tenant.userCount > 1 ? "s" : ""}</span>
                <span>{tenant.projectCount} projet{tenant.projectCount > 1 ? "s" : ""}</span>
                <span>{tenant.auditCount} audit{tenant.auditCount > 1 ? "s" : ""} ce mois</span>
                {tenant.mrr > 0 && <span className="font-medium text-slate-900">{tenant.mrr} € MRR</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={tenant.plan}
                onChange={(e) => handlePlanChange(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg font-bold uppercase cursor-pointer outline-none border"
                style={{
                  background: `${PLAN_COLORS[tenant.plan] ?? "#64748b"}10`,
                  color: PLAN_COLORS[tenant.plan] ?? "#64748b",
                  borderColor: `${PLAN_COLORS[tenant.plan] ?? "#64748b"}30`,
                }}
              >
                {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                onClick={handleSuspendToggle}
                className="text-sm px-4 py-2 rounded-lg font-medium transition-colors border"
                style={tenant.isSuspended
                  ? { background: "#f0fdf4", color: "#16a34a", borderColor: "#bbf7d0" }
                  : { background: "#fef2f2", color: "#dc2626", borderColor: "#fecaca" }}
              >
                {tenant.isSuspended ? "Réactiver" : "Suspendre"}
              </button>
            </div>
          </div>

          {/* Subscription */}
          {tenant.subscription && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Stripe</p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span>Statut : <span className="text-slate-900 font-medium">{tenant.subscription.status}</span></span>
                <span>Customer : <span className="text-slate-900 font-mono">{tenant.subscription.stripeCustomerId}</span></span>
                {tenant.subscription.currentPeriodEnd && (
                  <span>Période fin : <span className="text-slate-900">{new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}</span></span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Features ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-900">Features — Overrides admin</h3>
          <p className="text-xs text-slate-500 mt-0.5">L'override admin est prioritaire sur le défaut du plan. Cliquer sur ↩ pour supprimer l'override.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["Feature", "Défaut plan", "Override admin", "Effectif", "Note", "Actions"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenant.features.map((f) => (
              <FeatureToggle
                key={f.key}
                featureKey={f.key}
                label={f.label}
                planDefault={f.planDefault}
                override={f.override}
                enabled={f.enabled}
                tenantId={id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
