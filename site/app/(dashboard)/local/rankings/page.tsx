"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Map, MapPin } from "lucide-react"
import { useLocalListings, useLocalRankings } from "@/hooks/useLocal"

function rankColor(rank: number) {
  if (rank <= 3) return "#10b981"
  if (rank <= 10) return "#f59e0b"
  return "#ef4444"
}

export default function RankingsPage() {
  const { data: listings, isLoading: listingsLoading } = useLocalListings()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listingId = selectedId ?? listings?.[0]?.id ?? null
  const { data, isLoading: rankingsLoading } = useLocalRankings(listingId)

  const isLoading = listingsLoading || (!!listingId && rankingsLoading)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    )
  }

  const rankings = data?.rankings ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(124,58,237,0.1)" }}>
          <Map className="h-6 w-6" style={{ color: "#7c3aed" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rankings Maps</h1>
          <p className="text-sm text-slate-500">Positions dans Google Maps par mot-clé</p>
        </div>
      </div>

      {/* Listing selector */}
      {listings && listings.length > 1 && (
        <select
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
          value={listingId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>{l.businessName}</option>
          ))}
        </select>
      )}

      {rankings.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <MapPin className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucun ranking Maps</p>
            <p className="text-sm mt-1">Ajoutez des mots-clés pour suivre vos positions dans Google Maps.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-slate-100 rounded-2xl shadow-sm">
              <CardContent className="py-4 px-5 text-center">
                <p className="text-3xl font-bold text-slate-800">{rankings.length}</p>
                <p className="text-xs text-slate-500 mt-1">Mots-clés suivis</p>
              </CardContent>
            </Card>
            <Card className="border-slate-100 rounded-2xl shadow-sm">
              <CardContent className="py-4 px-5 text-center">
                <p className="text-3xl font-bold" style={{ color: "#7c3aed" }}>
                  {rankings.length > 0
                    ? (rankings.reduce((s, r) => s + r.avgRank, 0) / rankings.length).toFixed(1)
                    : "—"}
                </p>
                <p className="text-xs text-slate-500 mt-1">Position moyenne</p>
              </CardContent>
            </Card>
            <Card className="border-slate-100 rounded-2xl shadow-sm">
              <CardContent className="py-4 px-5 text-center">
                <p className="text-3xl font-bold text-emerald-600">
                  {rankings.filter((r) => r.bestRank <= 3).length}
                </p>
                <p className="text-xs text-slate-500 mt-1">Top 3</p>
              </CardContent>
            </Card>
          </div>

          {/* Rankings table */}
          <Card className="border-slate-100 rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Positions par mot-clé</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Mot-clé</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Position moy.</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Meilleure</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Dernière vérif.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 px-2 font-medium text-slate-800">{r.keyword}</td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge style={{ background: `${rankColor(r.avgRank)}15`, color: rankColor(r.avgRank) }}>
                            {r.avgRank.toFixed(1)}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="font-mono font-semibold" style={{ color: rankColor(r.bestRank) }}>
                            {r.bestRank}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center text-xs text-slate-500">
                          {new Date(r.checkedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
