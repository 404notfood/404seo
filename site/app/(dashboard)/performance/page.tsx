"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Gauge, Clock, Weight, ImageIcon } from "lucide-react"
import { usePerformanceOverview } from "@/hooks/useAggregation"
import type { PerformanceOverview } from "@/lib/api-client"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"

function getScoreColor(score: number): string {
  if (score >= 75) return "#10b981"
  if (score >= 50) return "#f59e0b"
  return "#ef4444"
}

function PerfGauge({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * 0.75
  const filled = (score / 100) * arcLength
  const color = getScoreColor(score)

  return (
    <div className="flex flex-col items-center gap-2">
      <div style={{ position: "relative", width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(135deg)" }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={10}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="font-bold leading-none"
            style={{ fontSize: size * 0.25, color }}
          >
            {score}
          </span>
          <span className="text-xs text-slate-400 font-medium">/100</span>
        </div>
      </div>
      <p className="text-xs font-medium text-slate-500">Score Performance</p>
    </div>
  )
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })
}

export default function PerformancePage() {
  const { data, isLoading } = usePerformanceOverview()

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-2xl" />
        <Skeleton className="h-[300px] rounded-2xl" />
      </div>
    )
  }

  const overview: PerformanceOverview = data ?? {
    avgScore: 0,
    reports: [],
    avgResponseTime: 0,
    avgPageSize: 0,
    imageOptRate: 0,
    slowestPages: [],
  }

  const chartData = overview.reports.map((r) => ({
    date: formatDate(r.date),
    scorePerformance: Math.round(r.scorePerformance),
  }))

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ background: "#2563eb15" }}
        >
          <Gauge className="h-5 w-5" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Vitesse & Performance
          </h1>
          <p className="text-sm text-slate-400">
            Metriques de performance moyennes sur l&apos;ensemble de vos audits
          </p>
        </div>
      </div>

      {/* Score + Metriques */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grande gauge */}
        <Card className="border border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="p-6 flex items-center justify-center">
            <PerfGauge score={Math.round(overview.avgScore)} size={180} />
          </CardContent>
        </Card>

        {/* Metriques grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Temps de reponse moyen */}
          <Card className="border border-slate-100 rounded-2xl shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{ background: "#06b6d415" }}
                >
                  <Clock className="h-4 w-4" style={{ color: "#06b6d4" }} />
                </div>
                <p className="text-xs font-medium text-slate-400">
                  Temps de reponse moyen
                </p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {Math.round(overview.avgResponseTime)}
                <span className="text-sm font-medium text-slate-400 ml-1">
                  ms
                </span>
              </p>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-0 px-2 py-0.5"
                style={{
                  background:
                    overview.avgResponseTime < 500
                      ? "#10b98115"
                      : overview.avgResponseTime < 1500
                        ? "#f59e0b15"
                        : "#ef444415",
                  color:
                    overview.avgResponseTime < 500
                      ? "#10b981"
                      : overview.avgResponseTime < 1500
                        ? "#f59e0b"
                        : "#ef4444",
                }}
              >
                {overview.avgResponseTime < 500
                  ? "Rapide"
                  : overview.avgResponseTime < 1500
                    ? "Moyen"
                    : "Lent"}
              </Badge>
            </CardContent>
          </Card>

          {/* Poids moyen */}
          <Card className="border border-slate-100 rounded-2xl shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{ background: "#f59e0b15" }}
                >
                  <Weight className="h-4 w-4" style={{ color: "#f59e0b" }} />
                </div>
                <p className="text-xs font-medium text-slate-400">
                  Poids moyen des pages
                </p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {Math.round(overview.avgPageSize / 1024)}
                <span className="text-sm font-medium text-slate-400 ml-1">
                  KB
                </span>
              </p>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-0 px-2 py-0.5"
                style={{
                  background:
                    overview.avgPageSize / 1024 < 500
                      ? "#10b98115"
                      : overview.avgPageSize / 1024 < 2000
                        ? "#f59e0b15"
                        : "#ef444415",
                  color:
                    overview.avgPageSize / 1024 < 500
                      ? "#10b981"
                      : overview.avgPageSize / 1024 < 2000
                        ? "#f59e0b"
                        : "#ef4444",
                }}
              >
                {overview.avgPageSize / 1024 < 500
                  ? "Leger"
                  : overview.avgPageSize / 1024 < 2000
                    ? "Moyen"
                    : "Lourd"}
              </Badge>
            </CardContent>
          </Card>

          {/* Taux optimisation images */}
          <Card className="border border-slate-100 rounded-2xl shadow-sm">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{ background: "#10b98115" }}
                >
                  <ImageIcon
                    className="h-4 w-4"
                    style={{ color: "#10b981" }}
                  />
                </div>
                <p className="text-xs font-medium text-slate-400">
                  Optimisation images
                </p>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {Math.round(overview.imageOptRate)}
                <span className="text-sm font-medium text-slate-400 ml-1">
                  %
                </span>
              </p>
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-0 px-2 py-0.5"
                style={{
                  background:
                    overview.imageOptRate >= 75
                      ? "#10b98115"
                      : overview.imageOptRate >= 50
                        ? "#f59e0b15"
                        : "#ef444415",
                  color:
                    overview.imageOptRate >= 75
                      ? "#10b981"
                      : overview.imageOptRate >= 50
                        ? "#f59e0b"
                        : "#ef4444",
                }}
              >
                {overview.imageOptRate >= 75
                  ? "Bon"
                  : overview.imageOptRate >= 50
                    ? "A ameliorer"
                    : "Critique"}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* LineChart evolution */}
      <Card className="border border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">
            Evolution du score performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center py-12">
              <Gauge className="h-10 w-10 mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">
                Pas encore de donnees de performance.
              </p>
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    width={35}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                    formatter={(value: number | undefined) => [
                      `${value ?? 0}/100`,
                      "Score",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="scorePerformance"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#2563eb", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6, fill: "#2563eb" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top 10 pages les plus lentes */}
      <Card className="border border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">
            Top 10 pages les plus lentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overview.slowestPages.length === 0 ? (
            <div className="text-center py-12">
              <Gauge className="h-10 w-10 mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">
                Aucune donnee de pages disponible.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Temps de reponse
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Poids
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Audit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.slowestPages.slice(0, 10).map((page, idx) => (
                    <tr
                      key={`${page.url}-${idx}`}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 max-w-[350px]">
                        <p
                          className="text-xs text-blue-600 truncate"
                          title={page.url}
                        >
                          {page.url}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{
                            color:
                              page.responseTime < 500
                                ? "#10b981"
                                : page.responseTime < 1500
                                  ? "#f59e0b"
                                  : "#ef4444",
                          }}
                        >
                          {Math.round(page.responseTime)} ms
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                        {Math.round(page.pageSize / 1024)} KB
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-400 max-w-[200px]">
                        <p className="truncate" title={page.auditUrl}>
                          {page.auditUrl}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
