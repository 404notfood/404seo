"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Search } from "lucide-react"
import { useAudits } from "@/hooks/useAudits"
import { useQuery } from "@tanstack/react-query"
import { apiClient, type SiteKeywordEntry } from "@/lib/api-client"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"

function scoreColor(s: number) {
  return s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444"
}

export default function KeywordsPage() {
  const { data: audits, isLoading: auditsLoading } = useAudits()
  const completedAudits = audits?.filter((a) => a.status === "COMPLETED") ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Auto-select first completed audit
  const auditId = selectedId ?? completedAudits[0]?.id ?? null

  const { data: keywords, isLoading: kwLoading } = useQuery({
    queryKey: ["audit-keywords", auditId],
    queryFn: () => apiClient.getAuditKeywords(auditId!),
    enabled: !!auditId,
    staleTime: 60_000,
  })

  const isLoading = auditsLoading || (!!auditId && kwLoading)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[400px] rounded-2xl" />
        <Skeleton className="h-[300px] rounded-2xl" />
      </div>
    )
  }

  const siteKw: SiteKeywordEntry[] =
    (keywords?.siteKeywords as { keywords?: SiteKeywordEntry[] } | null)?.keywords ?? []
  const top15 = [...siteKw].sort((a, b) => b.totalCount - a.totalCount).slice(0, 15)
  const chartData = [...top15].reverse()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <Search className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recherche de mots-clés</h1>
          <p className="text-sm text-slate-500">Mots-clés extraits de vos audits</p>
        </div>
      </div>

      {/* Audit selector */}
      {completedAudits.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 font-medium">Audit :</span>
          <select
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
            value={auditId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {completedAudits.map((a) => (
              <option key={a.id} value={a.id}>
                {a.url} — {new Date(a.createdAt).toLocaleDateString("fr-FR")}
              </option>
            ))}
          </select>
        </div>
      )}

      {siteKw.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            Aucun mot-clé détecté. Les mots-clés sont extraits automatiquement lors des audits.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Bar chart horizontal */}
          <Card className="border-slate-100 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Top 15 mots-clés</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={chartData}>
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="term" type="category" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: number | undefined) => value ?? 0} />
                    <Bar dataKey="totalCount" name="Occurrences" fill="#2563eb" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Tableau */}
          <Card className="border-slate-100 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{siteKw.length} mot{siteKw.length > 1 ? "s" : ""}-clé{siteKw.length > 1 ? "s" : ""}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Mot-clé</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Occurrences</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Pages</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Score</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Positions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteKw.map((kw) => (
                      <tr key={kw.term} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 px-2 font-medium text-slate-800">{kw.term}</td>
                        <td className="py-2.5 px-2 text-center font-mono">{kw.totalCount}</td>
                        <td className="py-2.5 px-2 text-center">{kw.pageCount}</td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge style={{ background: `${scoreColor(kw.avgScore)}20`, color: scoreColor(kw.avgScore) }}>
                            {Math.round(kw.avgScore)}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex flex-wrap gap-1">
                            {kw.positions.slice(0, 5).map((pos) => (
                              <Badge key={pos} variant="secondary" className="text-[10px]">{pos}</Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
