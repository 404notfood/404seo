"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, ArrowUp, ArrowDown, Minus } from "lucide-react"
import { ComingSoonBanner } from "@/components/layout/ComingSoonBanner"

const MOCK_KEYWORDS = [
  { keyword: "audit seo en ligne", position: 12, change: 3, volume: 2400, url: "/audit" },
  { keyword: "analyse seo site web", position: 8, change: -2, volume: 1800, url: "/analyse" },
  { keyword: "optimisation seo", position: 23, change: 5, volume: 5400, url: "/optimisation" },
  { keyword: "vérifier seo site", position: 15, change: 0, volume: 1200, url: "/verifier" },
  { keyword: "outil seo gratuit", position: 34, change: -1, volume: 3600, url: "/outil" },
  { keyword: "score seo", position: 6, change: 4, volume: 880, url: "/score" },
  { keyword: "rapport seo pdf", position: 18, change: 2, volume: 720, url: "/rapport" },
  { keyword: "erreurs seo", position: 27, change: -3, volume: 1500, url: "/erreurs" },
]

function ChangeIndicator({ change }: { change: number }) {
  if (change > 0) return <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-semibold"><ArrowUp className="h-3 w-3" />{change}</span>
  if (change < 0) return <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold"><ArrowDown className="h-3 w-3" />{Math.abs(change)}</span>
  return <span className="flex items-center gap-0.5 text-slate-400 text-xs"><Minus className="h-3 w-3" />0</span>
}

export default function RankTrackingPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <TrendingUp className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suivi de position</h1>
          <p className="text-sm text-slate-500">Suivez vos positions sur Google</p>
        </div>
      </div>

      <ComingSoonBanner feature="Le suivi de position" />

      {/* Mock stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-slate-800">8</p>
            <p className="text-xs text-slate-500 mt-1">Mots-clés suivis</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold" style={{ color: "#2563eb" }}>17.9</p>
            <p className="text-xs text-slate-500 mt-1">Position moyenne</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-emerald-600">3</p>
            <p className="text-xs text-slate-500 mt-1">Top 10</p>
          </CardContent>
        </Card>
      </div>

      {/* Mock table */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Positions actuelles (données de démonstration)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-2 font-semibold text-slate-600">Mot-clé</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Position</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Variation</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Volume</th>
                  <th className="text-left py-3 px-2 font-semibold text-slate-600">URL</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_KEYWORDS.map((kw) => (
                  <tr key={kw.keyword} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2.5 px-2 font-medium text-slate-800">{kw.keyword}</td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge variant={kw.position <= 10 ? "default" : "secondary"} className="text-xs">
                        {kw.position}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-center"><ChangeIndicator change={kw.change} /></td>
                    <td className="py-2.5 px-2 text-center text-slate-600">{kw.volume.toLocaleString("fr-FR")}</td>
                    <td className="py-2.5 px-2 text-slate-500 text-xs font-mono">{kw.url}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
