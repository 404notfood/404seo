"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiClient, type AuditComparison } from "@/lib/api-client"
import { useAudits } from "@/hooks/useAudits"
import { useActiveProject } from "@/contexts/ProjectContext"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRight, TrendingUp, TrendingDown, Minus, GitCompare, CheckCircle2, AlertTriangle } from "lucide-react"
import { formatDistanceToNow } from "@/lib/date"

function DeltaBadge({ value }: { value: number }) {
  if (value > 0)
    return <span className="flex items-center gap-1 text-sm font-semibold text-green-600"><TrendingUp className="h-4 w-4" />+{value}</span>
  if (value < 0)
    return <span className="flex items-center gap-1 text-sm font-semibold text-red-500"><TrendingDown className="h-4 w-4" />{value}</span>
  return <span className="flex items-center gap-1 text-sm font-medium text-slate-400"><Minus className="h-4 w-4" />0</span>
}

function ScoreBar({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before
  return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-50 last:border-0">
      <span className="w-28 text-sm font-medium text-slate-600">{label}</span>
      <div className="flex-1 flex items-center gap-3">
        <span className="text-sm font-bold text-slate-400 w-8 text-right">{before}</span>
        <ArrowRight className="h-4 w-4 text-slate-300" />
        <span className="text-sm font-bold" style={{ color: after >= before ? "#10b981" : "#ef4444" }}>{after}</span>
      </div>
      <DeltaBadge value={delta} />
    </div>
  )
}

export default function CompareAuditsPage() {
  const { activeProjectId } = useActiveProject()
  const { data: audits, isLoading: loadingAudits } = useAudits(activeProjectId)
  const [id1, setId1] = useState("")
  const [id2, setId2] = useState("")

  const { data: comparison, isLoading: loadingCompare, refetch } = useQuery({
    queryKey: ["audit-compare", id1, id2],
    queryFn: () => apiClient.compareAudits(id1, id2),
    enabled: false,
  })

  const completedAudits = audits?.filter((a) => a.status === "COMPLETED") ?? []

  function handleCompare() {
    if (id1 && id2 && id1 !== id2) refetch()
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a" }}>
          <GitCompare className="inline h-6 w-6 mr-2" style={{ color: "#2563eb" }} />
          Comparer deux audits
        </h1>
        <p className="text-sm text-slate-400 mt-1">Visualisez l&apos;évolution entre deux audits du même site</p>
      </div>

      {/* Sélection */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Audit avant</label>
            {loadingAudits ? <Skeleton className="h-10 w-full" /> : (
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={id1}
                onChange={(e) => setId1(e.target.value)}
              >
                <option value="">Sélectionner…</option>
                {completedAudits.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.project.name} — {a.report?.scoreGlobal ?? "?"}/100 — {formatDistanceToNow(a.createdAt)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Audit après</label>
            {loadingAudits ? <Skeleton className="h-10 w-full" /> : (
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={id2}
                onChange={(e) => setId2(e.target.value)}
              >
                <option value="">Sélectionner…</option>
                {completedAudits.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.project.name} — {a.report?.scoreGlobal ?? "?"}/100 — {formatDistanceToNow(a.createdAt)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <Button
          onClick={handleCompare}
          disabled={!id1 || !id2 || id1 === id2 || loadingCompare}
          className="btn-glow"
          style={{ background: "#2563eb" }}
        >
          {loadingCompare ? "Chargement…" : "Comparer"}
        </Button>
      </div>

      {/* Résultats */}
      {comparison && (
        <div className="space-y-6">
          {/* Score global */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Évolution du score global</p>
            <div className="flex items-center justify-center gap-8">
              <div>
                <p className="text-4xl font-bold" style={{ color: "#94a3b8" }}>{comparison.before.report?.scoreGlobal ?? 0}</p>
                <p className="text-xs text-slate-400 mt-1">Avant</p>
              </div>
              <ArrowRight className="h-8 w-8 text-slate-300" />
              <div>
                <p className="text-4xl font-bold" style={{ color: comparison.delta.global >= 0 ? "#10b981" : "#ef4444" }}>
                  {comparison.after.report?.scoreGlobal ?? 0}
                </p>
                <p className="text-xs text-slate-400 mt-1">Après</p>
              </div>
              <div className="ml-4 px-4 py-2 rounded-xl" style={{ background: comparison.delta.global >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)" }}>
                <DeltaBadge value={comparison.delta.global} />
              </div>
            </div>
          </div>

          {/* Scores détaillés */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Scores par catégorie</h3>
            <ScoreBar label="Technique" before={comparison.before.report?.scoreTechnical ?? 0} after={comparison.after.report?.scoreTechnical ?? 0} />
            <ScoreBar label="On-Page" before={comparison.before.report?.scoreOnPage ?? 0} after={comparison.after.report?.scoreOnPage ?? 0} />
            <ScoreBar label="Performance" before={comparison.before.report?.scorePerformance ?? 0} after={comparison.after.report?.scorePerformance ?? 0} />
            <ScoreBar label="UX Mobile" before={comparison.before.report?.scoreUX ?? 0} after={comparison.after.report?.scoreUX ?? 0} />
          </div>

          {/* Issues résolues / nouvelles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <h3 className="text-sm font-semibold text-slate-800">Problèmes résolus ({comparison.resolved.length})</h3>
              </div>
              {comparison.resolved.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun problème résolu</p>
              ) : (
                <ul className="space-y-2">
                  {comparison.resolved.map((c) => (
                    <li key={c} className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{c}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="text-sm font-semibold text-slate-800">Nouveaux problèmes ({comparison.newIssues.length})</h3>
              </div>
              {comparison.newIssues.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun nouveau problème</p>
              ) : (
                <ul className="space-y-2">
                  {comparison.newIssues.map((c) => (
                    <li key={c} className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{c}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
