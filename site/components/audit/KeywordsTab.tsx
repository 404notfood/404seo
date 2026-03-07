"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { useAuditKeywords } from "@/hooks/useKeywords"
import type { KeywordEntry, SiteKeywordEntry } from "@/lib/api-client"

interface KeywordsTabProps {
  auditId: string
  enabled: boolean
}

const POSITION_COLORS: Record<string, string> = {
  title: "bg-blue-100 text-blue-700",
  h1: "bg-indigo-100 text-indigo-700",
  h2: "bg-violet-100 text-violet-700",
  h3: "bg-purple-100 text-purple-700",
  meta: "bg-cyan-100 text-cyan-700",
  body: "bg-slate-100 text-slate-500",
}

function PositionBadge({ position }: { position: string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${POSITION_COLORS[position] ?? "bg-slate-100 text-slate-500"}`}>
      {position}
    </span>
  )
}

export function KeywordsTab({ auditId, enabled }: KeywordsTabProps) {
  const { data, isLoading } = useAuditKeywords(auditId, enabled)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-slate-500">Aucune donnée de mots-clés disponible.</p>
  }

  const siteKw = data.siteKeywords?.keywords ?? []
  const pageKeywords = data.pageKeywords ?? []
  const selectedPage = selectedPageId
    ? pageKeywords.find((p) => p.id === selectedPageId)
    : null

  // Chart data (top 15)
  const chartData = siteKw.slice(0, 15).map((kw) => ({
    term: kw.term.length > 20 ? kw.term.slice(0, 18) + "..." : kw.term,
    fullTerm: kw.term,
    score: kw.avgScore,
    pages: kw.pageCount,
  }))

  return (
    <div className="space-y-6">
      {/* Site-level keywords */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mots-clés du site ({siteKw.length})</CardTitle>
          <p className="text-xs text-slate-400">Score pondéré par position (Title, H1...) et IDF</p>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 && (
            <div className="h-[360px] mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="term"
                    tick={{ fontSize: 11 }}
                    width={100}
                  />
                  <Tooltip
                    formatter={(value) => [typeof value === "number" ? value : 0, "Score"]}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload as { fullTerm: string; pages: number } | undefined
                      return item ? `${item.fullTerm} (${item.pages} pages)` : String(label)
                    }}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? "#2563eb" : i < 8 ? "#3b82f6" : "#93c5fd"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Site keywords table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-100 text-left">
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500">#</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500">Mot-clé</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Occurrences</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Pages</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-right">Score</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500">Positions</th>
                </tr>
              </thead>
              <tbody>
                {siteKw.map((kw, i) => (
                  <tr key={kw.term} className={`border-b border-slate-50 ${i % 2 === 0 ? "bg-slate-50/50" : ""}`}>
                    <td className="px-3 py-2 text-slate-400 font-semibold">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{kw.term}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{kw.totalCount}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{kw.pageCount}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: `${Math.min(100, (kw.avgScore / (siteKw[0]?.avgScore || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums w-10 text-right">{kw.avgScore}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {kw.positions.map((p) => <PositionBadge key={p} position={p} />)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Per-page keywords */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mots-clés par page</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full p-2 border border-slate-200 rounded-lg text-sm mb-4"
            value={selectedPageId ?? ""}
            onChange={(e) => setSelectedPageId(e.target.value || null)}
          >
            <option value="">Sélectionner une page...</option>
            {pageKeywords.map((p) => (
              <option key={p.id} value={p.id}>{p.url}</option>
            ))}
          </select>

          {selectedPage && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-100 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500">#</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500">Mot-clé</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Occurrences</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-right">Score</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500">Positions</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedPage.topKeywords as KeywordEntry[]).map((kw, i) => (
                    <tr key={kw.term} className={`border-b border-slate-50 ${i % 2 === 0 ? "bg-slate-50/50" : ""}`}>
                      <td className="px-3 py-2 text-slate-400 font-semibold">{i + 1}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{kw.term}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{kw.count}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{kw.score}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          {kw.positions.map((p) => <PositionBadge key={p} position={p} />)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!selectedPage && (
            <p className="text-sm text-slate-400 text-center py-8">
              Sélectionnez une page pour voir ses mots-clés.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
