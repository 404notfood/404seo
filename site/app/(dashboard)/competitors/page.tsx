"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Target, Plus, Trash2, Loader2, ExternalLink, Lightbulb } from "lucide-react"
import { useCompetitors, useAddCompetitor, useDeleteCompetitor } from "@/hooks/useCompetitors"
import { useActiveProject } from "@/contexts/ProjectContext"
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
  Tooltip,
} from "recharts"

function scoreColor(s: number | null) {
  if (s === null) return "#94a3b8"
  return s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444"
}

function ScoreBar({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-slate-400 text-xs">—</span>
  const color = scoreColor(value)
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-1.5 rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}

const RADAR_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]

export default function CompetitorsPage() {
  const { activeProjectId } = useActiveProject()
  const { data, isLoading, refetch } = useCompetitors(activeProjectId)
  const { mutate: addCompetitor, isPending: isAdding } = useAddCompetitor()
  const { mutate: deleteCompetitor } = useDeleteCompetitor()

  const [newDomain, setNewDomain] = useState("")
  const [newLabel, setNewLabel] = useState("")

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newDomain.trim()) return
    addCompetitor(
      { domain: newDomain.trim(), label: newLabel.trim() || undefined, projectId: activeProjectId ?? undefined },
      { onSuccess: () => { setNewDomain(""); setNewLabel("") } }
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[300px] rounded-2xl" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    )
  }

  const own = data?.own ?? null
  const competitors = data?.competitors ?? []
  const suggested = data?.suggested ?? []

  // Préparer les données radar (si des audits existent)
  const radarCompetitors = competitors.filter((c) => c.hasAudit)
  const hasRadarData = own !== null && radarCompetitors.length > 0

  const radarData = hasRadarData
    ? [
        { subject: "Global", vous: own.scoreGlobal, ...Object.fromEntries(radarCompetitors.map((c) => [c.domain, c.scoreGlobal ?? 0])) },
        { subject: "Technique", vous: own.scoreTechnical, ...Object.fromEntries(radarCompetitors.map((c) => [c.domain, c.scoreTechnical ?? 0])) },
        { subject: "On-Page", vous: own.scoreOnPage, ...Object.fromEntries(radarCompetitors.map((c) => [c.domain, c.scoreOnPage ?? 0])) },
        { subject: "Perf.", vous: own.scorePerformance, ...Object.fromEntries(radarCompetitors.map((c) => [c.domain, c.scorePerformance ?? 0])) },
        { subject: "UX", vous: own.scoreUX, ...Object.fromEntries(radarCompetitors.map((c) => [c.domain, c.scoreUX ?? 0])) },
      ]
    : []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <Target className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analyse concurrents</h1>
          <p className="text-sm text-slate-500">Comparez vos scores SEO avec vos concurrents</p>
        </div>
      </div>

      {/* Radar chart */}
      {hasRadarData && (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Comparaison radar SEO</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Radar name="Vous" dataKey="vous" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
                  {radarCompetitors.slice(0, 4).map((c, i) => (
                    <Radar
                      key={c.id}
                      name={c.label || c.domain}
                      dataKey={c.domain}
                      stroke={RADAR_COLORS[i + 1] ?? "#94a3b8"}
                      fill={RADAR_COLORS[i + 1] ?? "#94a3b8"}
                      fillOpacity={0.1}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ajouter un concurrent */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">Ajouter un concurrent</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex items-center gap-3">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="concurrent.fr"
              className="flex-1 border-slate-200"
            />
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nom (optionnel)"
              className="w-40 border-slate-200"
            />
            <Button type="submit" disabled={isAdding || !newDomain.trim()} className="btn-glow gap-1.5" style={{ background: "#2563eb" }}>
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ajouter
            </Button>
          </form>
          <p className="text-xs text-slate-400 mt-2">
            Pour comparer les scores, auditez d&apos;abord le domaine concurrent depuis la page Audits.
          </p>
        </CardContent>
      </Card>

      {/* Tableau de comparaison */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{competitors.length + (own ? 1 : 0)} domaines comparés</CardTitle>
        </CardHeader>
        <CardContent>
          {competitors.length === 0 && !own ? (
            <div className="text-center py-10 text-slate-400">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-500">Aucun concurrent configuré</p>
              <p className="text-sm mt-1">Ajoutez vos concurrents pour comparer vos scores SEO.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Domaine</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Global</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600 hidden md:table-cell">Technique</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600 hidden md:table-cell">On-Page</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600 hidden lg:table-cell">Perf.</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600 hidden lg:table-cell">UX</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Problèmes</th>
                    <th className="py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Ligne "Vous" */}
                  {own && (
                    <tr className="border-b border-slate-50 bg-blue-50/30">
                      <td className="py-2.5 px-2">
                        <span className="font-semibold text-blue-700">{own.domain}</span>
                        <Badge className="ml-2 text-[9px]" style={{ background: "#2563eb20", color: "#2563eb" }}>Vous</Badge>
                      </td>
                      <td className="py-2.5 px-2 text-center"><ScoreBar value={own.scoreGlobal} /></td>
                      <td className="py-2.5 px-2 text-center hidden md:table-cell"><ScoreBar value={own.scoreTechnical} /></td>
                      <td className="py-2.5 px-2 text-center hidden md:table-cell"><ScoreBar value={own.scoreOnPage} /></td>
                      <td className="py-2.5 px-2 text-center hidden lg:table-cell"><ScoreBar value={own.scorePerformance} /></td>
                      <td className="py-2.5 px-2 text-center hidden lg:table-cell"><ScoreBar value={own.scoreUX} /></td>
                      <td className="py-2.5 px-2 text-center text-xs text-slate-600">
                        {own.criticalIssues != null ? <span className="text-red-600 font-semibold">{own.criticalIssues}</span> : "—"}
                        {own.totalIssues != null && <span className="text-slate-400"> / {own.totalIssues}</span>}
                      </td>
                      <td className="py-2.5 px-2"></td>
                    </tr>
                  )}
                  {/* Concurrents */}
                  {competitors.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-800">{c.label || c.domain}</span>
                          {c.label && <span className="text-xs text-slate-400">({c.domain})</span>}
                          {c.auditId && (
                            <a href={`/audits/${c.auditId}`} className="text-blue-400 hover:text-blue-600">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {!c.hasAudit && (
                          <p className="text-[10px] text-amber-600 mt-0.5">Pas encore audité</p>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center"><ScoreBar value={c.scoreGlobal} /></td>
                      <td className="py-2.5 px-2 text-center hidden md:table-cell"><ScoreBar value={c.scoreTechnical} /></td>
                      <td className="py-2.5 px-2 text-center hidden md:table-cell"><ScoreBar value={c.scoreOnPage} /></td>
                      <td className="py-2.5 px-2 text-center hidden lg:table-cell"><ScoreBar value={c.scorePerformance} /></td>
                      <td className="py-2.5 px-2 text-center hidden lg:table-cell"><ScoreBar value={c.scoreUX} /></td>
                      <td className="py-2.5 px-2 text-center text-xs text-slate-600">
                        {c.criticalIssues != null ? <span className="text-red-600 font-semibold">{c.criticalIssues}</span> : "—"}
                        {c.totalIssues != null && <span className="text-slate-400"> / {c.totalIssues}</span>}
                      </td>
                      <td className="py-2.5 px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                          onClick={() => deleteCompetitor(c.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggestions */}
      {suggested.length > 0 && (
        <Card className="border-amber-100 rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              Domaines suggérés (issus de vos backlinks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {suggested.map((s) => (
                <Button
                  key={s.domain}
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 border-amber-200"
                  onClick={() => { setNewDomain(s.domain); setNewLabel("") }}
                >
                  <Plus className="h-3 w-3" />
                  {s.domain}
                  <span className="text-slate-400">({s.mentionCount})</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
