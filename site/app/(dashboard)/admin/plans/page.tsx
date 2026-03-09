"use client"

import { useState, useEffect } from "react"
import { useAdminPlans, useUpdateAdminPlan, useSeedAdminPlans, useCreateAdminPlan } from "@/hooks/useAdmin"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Plus, X } from "lucide-react"
import type { PlanConfig } from "@/lib/api-client"

const PLAN_COLORS: Record<string, string> = {
  STARTER: "#64748b",
  PRO: "#2563eb",
  AGENCY: "#7c3aed",
  ENTERPRISE: "#06b6d4",
}

const ALL_PLANS = ["STARTER", "PRO", "AGENCY", "ENTERPRISE"]

const FEATURES_META = [
  { key: "featureAI",           label: "Visibilité IA" },
  { key: "featureRankTracking", label: "Suivi de positions" },
  { key: "featureLocalSeo",     label: "SEO Local" },
  { key: "featureWhiteLabel",   label: "Marque blanche" },
  { key: "featureApiAccess",    label: "Accès API" },
  { key: "featureCompetitors",  label: "Analyse concurrents" },
  { key: "featureBacklinks",    label: "Backlinks" },
]

function formatQuota(val: number) {
  return val === -1 ? "∞" : val.toString()
}
function parseQuota(val: string) {
  return val === "∞" || val === "-1" ? -1 : parseInt(val) || 0
}

function PlanCard({ plan, onSaved }: { plan: PlanConfig; onSaved: () => void }) {
  const [form, setForm] = useState<PlanConfig>({ ...plan })
  const [dirty, setDirty] = useState(false)
  const updatePlan = useUpdateAdminPlan()

  useEffect(() => {
    setForm({ ...plan })
    setDirty(false)
  }, [plan])

  function set<K extends keyof PlanConfig>(key: K, value: PlanConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave() {
    try {
      await updatePlan.mutateAsync({ plan: form.plan, data: form as unknown as Record<string, unknown> })
      toast.success(`Plan ${form.displayName} sauvegardé`)
      setDirty(false)
      onSaved()
    } catch {
      toast.error("Erreur lors de la sauvegarde")
    }
  }

  const color = PLAN_COLORS[plan.plan] ?? "#64748b"

  return (
    <div
      className="bg-white rounded-2xl p-5 flex flex-col gap-5 border shadow-sm"
      style={{ borderColor: `${color}30` }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">{form.displayName}</h3>
          <span
            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block"
            style={{ background: `${color}15`, color }}
          >
            {form.plan}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || updatePlan.isPending}
          className="text-sm px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-40 border"
          style={dirty
            ? { background: `${color}10`, color, borderColor: `${color}30` }
            : { background: "#f8fafc", color: "#94a3b8", borderColor: "#e2e8f0" }}
        >
          {updatePlan.isPending ? "Sauvegarde..." : dirty ? "Sauvegarder" : "Sauvegardé"}
        </button>
      </div>

      {/* ── Tarifs ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Tarifs</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Mensuel (€)</span>
            <input
              type="number"
              value={(form.price / 100).toFixed(0)}
              onChange={(e) => set("price", Math.round(parseFloat(e.target.value) * 100))}
              className="w-full px-3 py-2 rounded-lg text-sm text-slate-900 bg-white border border-slate-200 outline-none focus:border-blue-400"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Annuel (€)</span>
            <input
              type="number"
              value={(form.priceYearly ? form.priceYearly / 100 : 0).toFixed(0)}
              onChange={(e) => set("priceYearly", Math.round(parseFloat(e.target.value) * 100))}
              className="w-full px-3 py-2 rounded-lg text-sm text-slate-900 bg-white border border-slate-200 outline-none focus:border-blue-400"
            />
          </label>
          <label className="space-y-1 col-span-2">
            <span className="text-xs text-slate-500">Stripe Price ID mensuel</span>
            <input
              value={form.stripePriceId ?? ""}
              onChange={(e) => set("stripePriceId", e.target.value || null as unknown as string)}
              placeholder="price_..."
              className="w-full px-3 py-2 rounded-lg text-sm text-slate-900 bg-white border border-slate-200 outline-none focus:border-blue-400 font-mono"
            />
          </label>
          <label className="space-y-1 col-span-2">
            <span className="text-xs text-slate-500">Stripe Price ID annuel</span>
            <input
              value={form.stripePriceIdYearly ?? ""}
              onChange={(e) => set("stripePriceIdYearly", e.target.value || null as unknown as string)}
              placeholder="price_..."
              className="w-full px-3 py-2 rounded-lg text-sm text-slate-900 bg-white border border-slate-200 outline-none focus:border-blue-400 font-mono"
            />
          </label>
        </div>
      </div>

      {/* ── Quotas ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Quotas (∞ = illimité)</p>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { key: "auditQuota", label: "Audits/mois" },
              { key: "pageQuota", label: "Pages/audit" },
              { key: "projectQuota", label: "Projets" },
              { key: "userQuota", label: "Utilisateurs" },
            ] as { key: keyof PlanConfig; label: string }[]
          ).map(({ key, label }) => (
            <label key={key} className="space-y-1">
              <span className="text-xs text-slate-500">{label}</span>
              <input
                value={formatQuota(form[key] as number)}
                onChange={(e) => set(key, parseQuota(e.target.value) as PlanConfig[typeof key])}
                className="w-full px-3 py-2 rounded-lg text-sm text-slate-900 bg-white border border-slate-200 outline-none focus:border-blue-400"
              />
            </label>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Features incluses par défaut</p>
        <div className="space-y-2">
          {FEATURES_META.map(({ key, label }) => {
            const val = form[key as keyof PlanConfig] as boolean
            return (
              <label key={key} className="flex items-center gap-3 cursor-pointer group">
                <button
                  type="button"
                  onClick={() => set(key as keyof PlanConfig, !val as PlanConfig[keyof PlanConfig])}
                  className="h-5 w-9 rounded-full relative transition-all duration-200 shrink-0 border"
                  style={val
                    ? { background: color, borderColor: color }
                    : { background: "#e2e8f0", borderColor: "#cbd5e1" }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-200"
                    style={{ left: val ? "18px" : "2px" }}
                  />
                </button>
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{label}</span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Formulaire de création d'un nouveau plan ───────────────────────────────
function CreatePlanModal({ existingPlans, onClose, onCreated }: {
  existingPlans: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const availablePlans = ALL_PLANS.filter((p) => !existingPlans.includes(p))
  const createPlan = useCreateAdminPlan()
  const [form, setForm] = useState({
    plan: availablePlans[0] ?? "",
    displayName: "",
    price: 0,
    priceYearly: 0,
    auditQuota: 10,
    pageQuota: 500,
    projectQuota: 5,
    userQuota: 3,
    featureAI: false,
    featureRankTracking: false,
    featureLocalSeo: false,
    featureWhiteLabel: true,
    featureApiAccess: false,
    featureCompetitors: false,
    featureBacklinks: true,
  })

  async function handleCreate() {
    if (!form.plan) return toast.error("Sélectionnez un plan")
    if (!form.displayName.trim()) return toast.error("Nom d'affichage requis")
    try {
      await createPlan.mutateAsync({ ...form, price: form.price * 100, priceYearly: form.priceYearly * 100 })
      toast.success(`Plan ${form.displayName} créé`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création")
    }
  }

  if (availablePlans.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Créer un plan</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-slate-500 text-sm">Tous les plans disponibles (STARTER, PRO, AGENCY, ENTERPRISE) sont déjà configurés.</p>
          <button onClick={onClose} className="mt-4 w-full py-2 rounded-lg bg-slate-100 text-slate-700 font-medium text-sm">Fermer</button>
        </div>
      </div>
    )
  }

  const color = PLAN_COLORS[form.plan] ?? "#64748b"

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl my-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Créer un plan</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          {/* Plan */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</span>
              <select
                value={form.plan}
                onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm border border-slate-200 outline-none focus:border-blue-400"
                style={{ color, fontWeight: 700 }}
              >
                {availablePlans.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nom affiché</span>
              <input
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Ex : Enterprise"
                className="w-full px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-900 outline-none focus:border-blue-400"
              />
            </label>
          </div>

          {/* Tarifs */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Tarifs</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Mensuel (€)</span>
                <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-900 outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-500">Annuel (€)</span>
                <input type="number" value={form.priceYearly} onChange={(e) => setForm((f) => ({ ...f, priceYearly: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-900 outline-none focus:border-blue-400" />
              </label>
            </div>
          </div>

          {/* Quotas */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Quotas</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "auditQuota", label: "Audits/mois" },
                { key: "pageQuota", label: "Pages/audit" },
                { key: "projectQuota", label: "Projets" },
                { key: "userQuota", label: "Utilisateurs" },
              ].map(({ key, label }) => (
                <label key={key} className="space-y-1">
                  <span className="text-xs text-slate-500">{label} (-1=∞)</span>
                  <input type="number" value={(form as unknown as Record<string, number>)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg text-sm border border-slate-200 text-slate-900 outline-none focus:border-blue-400" />
                </label>
              ))}
            </div>
          </div>

          {/* Features */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Features incluses</p>
            <div className="grid grid-cols-2 gap-2">
              {FEATURES_META.map(({ key, label }) => {
                const val = (form as unknown as Record<string, boolean>)[key]
                return (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, [key]: !val }))}
                      className="h-4 w-8 rounded-full relative transition-all duration-150 shrink-0 border"
                      style={val ? { background: color, borderColor: color } : { background: "#e2e8f0", borderColor: "#cbd5e1" }}
                    >
                      <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-150" style={{ left: val ? "14px" : "2px" }} />
                    </button>
                    <span className="text-xs text-slate-600">{label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={createPlan.isPending}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60 transition-colors"
            style={{ background: color }}
          >
            {createPlan.isPending ? "Création..." : "Créer le plan"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPlansPage() {
  const { data, isLoading, refetch } = useAdminPlans()
  const seedPlans = useSeedAdminPlans()
  const [showCreateModal, setShowCreateModal] = useState(false)

  async function handleSeed() {
    try {
      const res = await seedPlans.mutateAsync()
      const created = (res.results as Array<{ action: string }>).filter((r) => r.action === "created").length
      toast.success(`${created} plan${created > 1 ? "s" : ""} créé${created > 1 ? "s" : ""}`)
      refetch()
    } catch {
      toast.error("Erreur lors de l'initialisation")
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-96 rounded-2xl" />
        ))}
      </div>
    )
  }

  const plans = data?.plans ?? []
  const existingPlanKeys = plans.map((p) => p.plan)
  const hasAvailablePlans = ALL_PLANS.some((p) => !existingPlanKeys.includes(p))

  return (
    <div className="space-y-6">
      {showCreateModal && (
        <CreatePlanModal
          existingPlans={existingPlanKeys}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => refetch()}
        />
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {plans.length === 0
            ? "Aucune configuration de plan en base."
            : `${plans.length} plan${plans.length > 1 ? "s" : ""} configuré${plans.length > 1 ? "s" : ""}`}
        </p>
        <div className="flex items-center gap-2">
          {hasAvailablePlans && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nouveau plan
            </button>
          )}
          <button
            onClick={handleSeed}
            disabled={seedPlans.isPending}
            className="text-sm px-4 py-2 rounded-lg font-medium transition-colors bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            {seedPlans.isPending ? "Initialisation..." : "Initialiser les plans par défaut"}
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
          <p className="text-slate-500 mb-4">Aucun plan configuré. Cliquez sur "Initialiser les plans par défaut" pour créer les 3 plans (Starter, Pro, Agency).</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.plan} plan={plan} onSaved={() => refetch()} />
          ))}
        </div>
      )}
    </div>
  )
}
