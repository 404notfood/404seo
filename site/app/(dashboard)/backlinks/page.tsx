"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Link2, ExternalLink } from "lucide-react"
import { ComingSoonBanner } from "@/components/layout/ComingSoonBanner"

const MOCK_BACKLINKS = [
  { source: "blog-tech.fr/article-seo", target: "/guide-seo", anchor: "guide SEO complet", da: 72, dofollow: true, date: "2026-02-15" },
  { source: "marketing-digital.com/top-outils", target: "/", anchor: "plateforme SEO", da: 65, dofollow: true, date: "2026-02-10" },
  { source: "forum-webmaster.fr/sujet/123", target: "/audits", anchor: "audit de site", da: 45, dofollow: false, date: "2026-01-28" },
  { source: "annuaire-web.com/seo", target: "/", anchor: "outil SEO", da: 38, dofollow: true, date: "2026-01-20" },
  { source: "tech-review.fr/comparatif", target: "/pricing", anchor: "voir les tarifs", da: 58, dofollow: true, date: "2026-01-15" },
  { source: "blog-startup.com/outils", target: "/", anchor: "SEO Platform", da: 52, dofollow: false, date: "2026-01-10" },
]

export default function BacklinksPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <Link2 className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Backlinks</h1>
          <p className="text-sm text-slate-500">Analysez votre profil de liens</p>
        </div>
      </div>

      <ComingSoonBanner feature="L'analyse de backlinks" />

      {/* Mock stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-slate-800">6</p>
            <p className="text-xs text-slate-500 mt-1">Total backlinks</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold" style={{ color: "#2563eb" }}>4</p>
            <p className="text-xs text-slate-500 mt-1">Domaines référents</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-emerald-600">4</p>
            <p className="text-xs text-slate-500 mt-1">Dofollow</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold" style={{ color: "#f59e0b" }}>55</p>
            <p className="text-xs text-slate-500 mt-1">DA moyen</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Liens entrants (données de démonstration)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-2 font-semibold text-slate-600">Source</th>
                  <th className="text-left py-3 px-2 font-semibold text-slate-600">Page cible</th>
                  <th className="text-left py-3 px-2 font-semibold text-slate-600">Ancre</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">DA</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Type</th>
                  <th className="text-center py-3 px-2 font-semibold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_BACKLINKS.map((bl, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2.5 px-2">
                      <span className="text-xs text-blue-600 font-mono flex items-center gap-1">
                        {bl.source.length > 35 ? bl.source.slice(0, 35) + "…" : bl.source}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-slate-600 font-mono">{bl.target}</td>
                    <td className="py-2.5 px-2 text-xs text-slate-700">{bl.anchor}</td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge variant="secondary" className="text-xs">{bl.da}</Badge>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge
                        className="text-[10px]"
                        style={{
                          background: bl.dofollow ? "#10b98115" : "#64748b15",
                          color: bl.dofollow ? "#10b981" : "#64748b",
                        }}
                      >
                        {bl.dofollow ? "dofollow" : "nofollow"}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-center text-xs text-slate-500">
                      {new Date(bl.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
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
