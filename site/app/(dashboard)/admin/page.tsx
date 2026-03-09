"use client"

import { useAdminStats, useAdminTenants } from "@/hooks/useAdmin"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, Users, Building2, Zap } from "lucide-react"

const PLAN_COLORS: Record<string, string> = {
  STARTER: "#64748b",
  PRO: "#2563eb",
  AGENCY: "#7c3aed",
  ENTERPRISE: "#06b6d4",
}

const PLAN_LABELS: Record<string, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  AGENCY: "Agency",
  ENTERPRISE: "Enterprise",
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  sub?: string
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-slate-500">{label}</p>
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon className="h-4.5 w-4.5" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminPage() {
  const { data: stats, isLoading } = useAdminStats()
  const { data: tenantsData } = useAdminTenants({ page: 1 })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  const totalPlans = Object.values(stats?.planBreakdown ?? {}).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-6">
      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="MRR"
          value={`${stats?.mrr?.toLocaleString("fr-FR") ?? 0} €`}
          icon={TrendingUp}
          color="#2563eb"
          sub="Abonnements actifs"
        />
        <StatCard
          label="Tenants actifs"
          value={stats?.tenantCount ?? 0}
          icon={Building2}
          color="#06b6d4"
          sub="Comptes clients"
        />
        <StatCard
          label="Utilisateurs"
          value={stats?.userCount ?? 0}
          icon={Users}
          color="#7c3aed"
          sub="Tous les utilisateurs"
        />
        <StatCard
          label="Audits ce mois"
          value={stats?.auditsThisMonth ?? 0}
          icon={Zap}
          color="#f59e0b"
          sub="Depuis le 1er du mois"
        />
      </div>

      {/* ── Breakdown plans ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Répartition des plans</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(stats?.planBreakdown ?? {}).map(([plan, count]) => {
            const color = PLAN_COLORS[plan] ?? "#64748b"
            const pct = totalPlans > 0 ? Math.round((count / totalPlans) * 100) : 0
            return (
              <div
                key={plan}
                className="flex items-center gap-3 px-4 py-3 rounded-xl flex-1 min-w-[120px] border"
                style={{ background: `${color}08`, borderColor: `${color}25` }}
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                <div>
                  <p className="text-xs font-bold" style={{ color }}>
                    {PLAN_LABELS[plan] ?? plan}
                  </p>
                  <p className="text-lg font-bold text-slate-900 leading-none mt-0.5">{count}</p>
                  <p className="text-[10px] text-slate-400">{pct}%</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Top 5 tenants récents ── */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-900">Tenants récents</h2>
          <a href="/admin/tenants" className="text-xs text-blue-600 hover:underline">
            Voir tout →
          </a>
        </div>
        <div className="space-y-2">
          {(tenantsData?.tenants ?? []).slice(0, 5).map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-blue-100">
                <span className="text-xs font-bold text-blue-600">{t.name[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{t.name}</p>
                <p className="text-xs text-slate-400">{t.userCount} utilisateur{t.userCount > 1 ? "s" : ""} · {t.auditCount} audit{t.auditCount > 1 ? "s" : ""}</p>
              </div>
              <span
                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: `${PLAN_COLORS[t.plan] ?? "#64748b"}15`,
                  color: PLAN_COLORS[t.plan] ?? "#64748b",
                }}
              >
                {PLAN_LABELS[t.plan] ?? t.plan}
              </span>
              {t.isSuspended && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 bg-red-50 text-red-600">
                  Suspendu
                </span>
              )}
            </div>
          ))}
          {!tenantsData?.tenants?.length && (
            <p className="text-sm text-slate-400 text-center py-4">Aucun tenant</p>
          )}
        </div>
      </div>
    </div>
  )
}
