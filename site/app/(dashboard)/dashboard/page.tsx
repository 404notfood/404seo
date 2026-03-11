"use client"

import { useAuditStats } from "@/hooks/useAudits"
import { useActiveProject } from "@/contexts/ProjectContext"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { Search, TrendingUp, AlertTriangle, CheckCircle, Clock, ArrowRight, Activity } from "lucide-react"
import OnboardingWizard from "@/components/dashboard/OnboardingWizard"
import { formatDistanceToNow } from "@/lib/date"
import type { AuditStatus } from "@/lib/api-client"

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  PENDING:           { label: "En attente",   dot: "#64748b" },
  CRAWLING:          { label: "Crawl…",       dot: "#2563eb" },
  ANALYZING:         { label: "Analyse…",     dot: "#2563eb" },
  SCORING:           { label: "Scoring…",     dot: "#2563eb" },
  GENERATING_REPORT: { label: "Rapport…",     dot: "#06b6d4" },
  COMPLETED:         { label: "Terminé",      dot: "#10b981" },
  FAILED:            { label: "Échoué",       dot: "#ef4444" },
  CANCELLED:         { label: "Annulé",       dot: "#64748b" },
}

function scoreColor(score: number) {
  if (score >= 70) return "#10b981"
  if (score >= 40) return "#f59e0b"
  return "#ef4444"
}

function scoreGrade(score: number) {
  if (score >= 90) return "A"
  if (score >= 75) return "B"
  if (score >= 60) return "C"
  if (score >= 40) return "D"
  return "F"
}

// Stat card premium
function StatCard({
  label, value, sub, icon: Icon, accent, loading,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: string
  loading: boolean
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{label}</p>
          {loading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <p className="text-4xl font-bold tracking-tight leading-none animate-score" style={{ color: "#0f172a" }}>
              {value}
            </p>
          )}
          {sub && !loading && (
            <p className="text-xs text-slate-400 mt-2">{sub}</p>
          )}
        </div>
        <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}14` }}>
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { activeProjectId } = useActiveProject()
  const { data: stats, isLoading } = useAuditStats(activeProjectId)

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a" }}>Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Vue d&apos;ensemble de vos performances SEO</p>
        </div>
        <Button asChild className="btn-glow" style={{ background: "#2563eb" }}>
          <Link href="/audits">
            <Search className="h-4 w-4 mr-2" />
            Nouvel audit
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Audits total"
          value={stats?.total ?? 0}
          sub={`${stats?.completed ?? 0} terminés`}
          icon={Search}
          accent="#2563eb"
          loading={isLoading}
        />
        <StatCard
          label="Score moyen"
          value={stats?.avgScore != null ? `${stats.avgScore}` : "—"}
          sub={stats?.avgScore != null ? `Grade ${scoreGrade(stats.avgScore)}` : "Aucun audit"}
          icon={TrendingUp}
          accent={stats?.avgScore != null ? scoreColor(stats.avgScore) : "#2563eb"}
          loading={isLoading}
        />
        <StatCard
          label="Critiques"
          value={stats?.totalCritical ?? 0}
          sub="Problèmes bloquants"
          icon={AlertTriangle}
          accent={(stats?.totalCritical ?? 0) > 0 ? "#ef4444" : "#10b981"}
          loading={isLoading}
        />
        <StatCard
          label="Réussis"
          value={stats?.totalPassed ?? 0}
          sub="Checks validés"
          icon={CheckCircle}
          accent="#10b981"
          loading={isLoading}
        />
      </div>

      {/* Contenu principal */}
      {!isLoading && stats && stats.total > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Audits récents — 2/3 */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #f1f5f9" }}>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" style={{ color: "#2563eb" }} />
                <h2 className="text-sm font-semibold text-slate-800">Audits récents</h2>
              </div>
              <Link href="/audits" className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-70" style={{ color: "#2563eb" }}>
                Voir tout <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="divide-y divide-slate-50">
              {stats.recent.map((audit) => {
                const cfg = STATUS_CONFIG[audit.status] ?? { label: audit.status, dot: "#94a3b8" }
                const isRunning = !["COMPLETED", "FAILED", "CANCELLED"].includes(audit.status)
                return (
                  <Link
                    key={audit.id}
                    href={`/audits/${audit.id}`}
                    className="flex items-center px-6 py-4 hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Score circle */}
                    <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center mr-4 font-bold text-sm"
                      style={{
                        background: audit.report ? `${scoreColor(audit.report.scoreGlobal)}14` : "#f1f5f9",
                        color: audit.report ? scoreColor(audit.report.scoreGlobal) : "#94a3b8",
                        border: `1.5px solid ${audit.report ? scoreColor(audit.report.scoreGlobal) + "40" : "#e2e8f0"}`,
                      }}
                    >
                      {audit.report ? audit.report.scoreGlobal : "—"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {audit.project.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{audit.url}</p>
                    </div>

                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: cfg.dot }}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "animate-pulse" : ""}`} style={{ background: cfg.dot }} />
                        {cfg.label}
                      </span>
                      <span className="text-xs text-slate-300 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(audit.createdAt)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Panel droit — 1/3 */}
          <div className="space-y-4">
            {/* Score highlight */}
            {stats.avgScore != null && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Score Global</p>
                <div className="relative inline-flex items-center justify-center w-28 h-28 mx-auto">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="#f1f5f9" strokeWidth="2.5" />
                    <circle
                      cx="18" cy="18" r="16" fill="none"
                      stroke={scoreColor(stats.avgScore)}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${(stats.avgScore / 100) * 100.53} 100.53`}
                      style={{ transition: "stroke-dasharray 1s ease" }}
                    />
                  </svg>
                  <div>
                    <p className="text-4xl font-bold leading-none animate-score" style={{ color: scoreColor(stats.avgScore) }}>
                      {stats.avgScore}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">/100</p>
                  </div>
                </div>
                <p className="text-sm font-semibold mt-4" style={{ color: scoreColor(stats.avgScore) }}>
                  Grade {scoreGrade(stats.avgScore)}
                </p>
              </div>
            )}

            {/* CTA */}
            <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(37,99,235,0.3)" }}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(6,182,212,0.15)" }}>
                <Search className="h-4 w-4" style={{ color: "#06b6d4" }} />
              </div>
              <p className="text-sm font-semibold mb-1">Nouvel audit</p>
              <p className="text-xs mb-4" style={{ color: "#64748b" }}>Analysez un site en quelques minutes</p>
              <Button asChild size="sm" className="w-full btn-glow" style={{ background: "#2563eb" }}>
                <Link href="/audits">Lancer →</Link>
              </Button>
            </div>
          </div>
        </div>

      ) : !isLoading ? (
        /* Onboarding wizard pour les nouveaux utilisateurs */
        <OnboardingWizard />
      ) : null}
    </div>
  )
}
