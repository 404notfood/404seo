"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Target } from "lucide-react"
import { ComingSoonBanner } from "@/components/layout/ComingSoonBanner"

const MOCK_COMPETITORS = [
  { domain: "concurrent-a.fr", score: 82, keywords: 1240, backlinks: 8500, traffic: "45K" },
  { domain: "concurrent-b.com", score: 76, keywords: 980, backlinks: 6200, traffic: "32K" },
  { domain: "concurrent-c.fr", score: 71, keywords: 750, backlinks: 4100, traffic: "28K" },
  { domain: "votre-site.fr", score: 65, keywords: 420, backlinks: 1800, traffic: "12K" },
  { domain: "concurrent-d.com", score: 58, keywords: 310, backlinks: 2400, traffic: "8K" },
]

function scoreColor(s: number) {
  return s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444"
}

export default function CompetitorsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <Target className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analyse concurrents</h1>
          <p className="text-sm text-slate-500">Comparez vos performances SEO à celles de vos concurrents</p>
        </div>
      </div>

      <ComingSoonBanner feature="L'analyse concurrentielle" />

      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Comparaison (données de démonstration)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-2 font-semibold text-slate-600">Domaine</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Score SEO</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Mots-clés</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Backlinks</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Trafic est.</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_COMPETITORS.map((c) => {
                  const isYou = c.domain === "votre-site.fr"
                  return (
                    <tr key={c.domain} className={`border-b border-slate-50 ${isYou ? "bg-blue-50/50" : "hover:bg-slate-50/50"}`}>
                      <td className="py-2.5 px-2">
                        <span className={`font-medium ${isYou ? "text-blue-700" : "text-slate-800"}`}>
                          {c.domain}
                        </span>
                        {isYou && <Badge className="ml-2 text-[9px]" style={{ background: "#2563eb20", color: "#2563eb" }}>Vous</Badge>}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Badge style={{ background: `${scoreColor(c.score)}15`, color: scoreColor(c.score) }}>
                          {c.score}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600">{c.keywords.toLocaleString("fr-FR")}</td>
                      <td className="py-2.5 px-2 text-center text-slate-600">{c.backlinks.toLocaleString("fr-FR")}</td>
                      <td className="py-2.5 px-2 text-center text-slate-600">{c.traffic}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
