"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Eye } from "lucide-react"
import { ComingSoonBanner } from "@/components/layout/ComingSoonBanner"

const MOCK_AI_RESULTS = [
  { query: "Quel est le meilleur outil d'audit SEO ?", mentioned: true, position: 2, engine: "ChatGPT" },
  { query: "Comment analyser le SEO d'un site ?", mentioned: true, position: 4, engine: "Claude" },
  { query: "Outils SEO gratuits en français", mentioned: false, position: null, engine: "Perplexity" },
  { query: "Alternative à Semrush pas cher", mentioned: true, position: 6, engine: "ChatGPT" },
  { query: "Audit SEO technique en ligne", mentioned: false, position: null, engine: "Gemini" },
  { query: "Meilleur outil analyse on-page", mentioned: true, position: 3, engine: "Claude" },
]

export default function AIVisibilityPage() {
  const mentioned = MOCK_AI_RESULTS.filter((r) => r.mentioned).length
  const total = MOCK_AI_RESULTS.length
  const rate = Math.round((mentioned / total) * 100)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
          <Eye className="h-6 w-6" style={{ color: "#06b6d4" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visibilité IA</h1>
          <p className="text-sm text-slate-500">Votre présence dans les réponses des IA génératives</p>
        </div>
      </div>

      <ComingSoonBanner feature="Le suivi de visibilité IA" />

      {/* Mock stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold" style={{ color: "#06b6d4" }}>{rate}%</p>
            <p className="text-xs text-slate-500 mt-1">Taux de mention</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-slate-800">{mentioned}/{total}</p>
            <p className="text-xs text-slate-500 mt-1">Requêtes avec mention</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-emerald-600">3.8</p>
            <p className="text-xs text-slate-500 mt-1">Position moyenne</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Résultats IA (données de démonstration)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-2 font-semibold text-slate-600">Requête</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Mentionné</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Position</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Moteur IA</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_AI_RESULTS.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2.5 px-2 text-slate-800">{r.query}</td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge
                        className="text-[10px]"
                        style={{
                          background: r.mentioned ? "#10b98115" : "#ef444415",
                          color: r.mentioned ? "#10b981" : "#ef4444",
                        }}
                      >
                        {r.mentioned ? "Oui" : "Non"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {r.position ? (
                        <span className="font-mono font-semibold text-slate-700">{r.position}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge variant="secondary" className="text-xs">{r.engine}</Badge>
                    </td>
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
