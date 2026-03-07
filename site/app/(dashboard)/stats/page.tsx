"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart3 } from "lucide-react"
import { useStatsTimeline } from "@/hooks/useAggregation"
import { useActiveProject } from "@/contexts/ProjectContext"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts"

const SCORE_LINES = [
  { key: "scoreGlobal", label: "Global", color: "#2563eb" },
  { key: "scoreTechnical", label: "Technique", color: "#06b6d4" },
  { key: "scoreOnPage", label: "On-Page", color: "#10b981" },
  { key: "scorePerformance", label: "Performance", color: "#f59e0b" },
  { key: "scoreUX", label: "UX Mobile", color: "#7c3aed" },
] as const

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444"]

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

export default function StatsPage() {
  const { activeProjectId } = useActiveProject()
  const { data, isLoading } = useStatsTimeline(activeProjectId)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[380px] rounded-2xl" />
          <Skeleton className="h-[380px] rounded-2xl" />
        </div>
        <Skeleton className="h-[300px] rounded-2xl" />
      </div>
    )
  }

  const timeline = data?.timeline ?? []
  const dist = data?.distribution ?? { pass: 0, warn: 0, fail: 0 }

  const pieData = [
    { name: "Réussi", value: dist.pass },
    { name: "Avertissement", value: dist.warn },
    { name: "Échoué", value: dist.fail },
  ]

  // Group audits by month for bar chart
  const monthMap = new Map<string, number>()
  for (const t of timeline) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1)
  }
  const barData = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => {
      const [y, m] = month.split("-")
      const label = new Date(Number(y), Number(m) - 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
      return { month: label, count }
    })

  const chartTimeline = timeline.map((t) => ({ ...t, date: fmtDate(t.date) }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <BarChart3 className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Statistiques</h1>
          <p className="text-sm text-slate-500">Vue d'ensemble de l'évolution SEO</p>
        </div>
      </div>

      {timeline.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            Aucune donnée. Lancez des audits pour voir les statistiques.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Evolution des scores */}
          <Card className="border-slate-100 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Évolution des scores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartTimeline}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => (typeof value === "number" ? value : "—")} />
                    <Legend />
                    {SCORE_LINES.map((l) => (
                      <Line
                        key={l.key}
                        type="monotone"
                        dataKey={l.key}
                        name={l.label}
                        stroke={l.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribution */}
            <Card className="border-slate-100 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Distribution des résultats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }: { name?: string; percent?: number }) =>
                          `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => (typeof value === "number" ? value : 0)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Audits par mois */}
            <Card className="border-slate-100 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Audits par mois</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => (typeof value === "number" ? value : 0)} />
                      <Bar dataKey="count" name="Audits" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
