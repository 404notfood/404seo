"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { FileSearch, AlertTriangle, FileWarning, Heading1, ImageOff } from "lucide-react"
import { useOnPageOverview } from "@/hooks/useAggregation"
import { useActiveProject } from "@/contexts/ProjectContext"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

// ── Score color helpers ──────────────────────────
function getScoreColor(score: number): string {
  if (score >= 75) return "#10b981"
  if (score >= 50) return "#f59e0b"
  return "#ef4444"
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// ── Score circle SVG ─────────────────────────────
function ScoreCircle({ score, size = 160 }: { score: number; size?: number }) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * 0.75
  const filled = (score / 100) * arcLength
  const color = getScoreColor(score)

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(135deg)" }}>
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
        <span className="font-bold leading-none" style={{ fontSize: size * 0.25, color }}>
          {score}
        </span>
        <span className="text-xs text-slate-400 font-medium">/100</span>
      </div>
    </div>
  )
}

// ── Custom tooltip ───────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value?: number | undefined }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const value = payload[0]?.value
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="font-bold" style={{ color: "#2563eb" }}>
        {value !== undefined ? `${value}/100` : "N/A"}
      </p>
    </div>
  )
}

// ── Counter cards config ─────────────────────────
const counters = [
  {
    key: "missingTitles" as const,
    label: "Pages sans titre",
    icon: AlertTriangle,
    iconColor: "#f59e0b",
    bgColor: "#f59e0b10",
  },
  {
    key: "missingMeta" as const,
    label: "Pages sans meta description",
    icon: FileWarning,
    iconColor: "#ef4444",
    bgColor: "#ef444410",
  },
  {
    key: "missingH1" as const,
    label: "Pages sans H1",
    icon: Heading1,
    iconColor: "#f59e0b",
    bgColor: "#f59e0b10",
  },
  {
    key: "missingAlt" as const,
    label: "Pages sans ALT images",
    icon: ImageOff,
    iconColor: "#ef4444",
    bgColor: "#ef444410",
  },
]

// ── Page component ───────────────────────────────
export default function OnPagePage() {
  const { activeProjectId } = useActiveProject()
  const { data, isLoading } = useOnPageOverview(activeProjectId)

  // Chart data : format dates
  const chartData = (data?.reports ?? []).map((r) => ({
    date: formatDate(r.date),
    scoreOnPage: r.scoreOnPage,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="p-2.5 rounded-xl"
          style={{ background: "rgba(37,99,235,0.08)" }}
        >
          <FileSearch className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analyse On-Page</h1>
          <p className="text-sm text-slate-500">
            Vue d'ensemble de l'optimisation on-page de vos pages
          </p>
        </div>
      </div>

      {/* Score global */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardContent className="flex items-center justify-center py-8">
          {isLoading ? (
            <Skeleton className="h-40 w-40 rounded-full" />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ScoreCircle score={Math.round(data?.avgScore ?? 0)} size={160} />
              <p className="text-sm font-medium text-slate-500">Score on-page moyen</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compteurs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {counters.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.key} className="border-slate-100 rounded-2xl shadow-sm">
              <CardContent className="py-5 px-5 flex items-center gap-4">
                <div
                  className="p-2.5 rounded-xl shrink-0"
                  style={{ background: c.bgColor }}
                >
                  <Icon className="h-5 w-5" style={{ color: c.iconColor }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500 truncate">
                    {c.label}
                  </p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-slate-900 mt-0.5">
                      {data?.[c.key] ?? 0}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* LineChart : Evolution score on-page */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            Evolution du score on-page
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-slate-400">
              Aucune donnée disponible. Lancez un audit pour voir l'évolution.
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
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
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="scoreOnPage"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#2563eb" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tableau : Pages avec le plus de problemes */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            Pages avec le plus de problèmes on-page
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : !data?.worstPages?.length ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              Aucune page avec des problèmes on-page détectée.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="text-center py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Nombre de problèmes
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Audit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.worstPages.map((page, idx) => (
                    <tr
                      key={`${page.url}-${idx}`}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <span className="text-slate-700 font-medium truncate block max-w-[400px]">
                          {page.url}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant="secondary"
                          className="font-bold"
                          style={{
                            background:
                              page.issueCount >= 5
                                ? "#ef444415"
                                : page.issueCount >= 3
                                ? "#f59e0b15"
                                : "#10b98115",
                            color:
                              page.issueCount >= 5
                                ? "#ef4444"
                                : page.issueCount >= 3
                                ? "#f59e0b"
                                : "#10b981",
                          }}
                        >
                          {page.issueCount}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-slate-500 text-xs truncate block max-w-[250px]">
                          {page.auditUrl}
                        </span>
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
