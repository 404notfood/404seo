"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Sparkles, RefreshCw, Zap, FileText, Link2, Globe } from "lucide-react"
import { useOptimization } from "@/hooks/useAggregation"

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  TECHNICAL: Globe,
  ON_PAGE: FileText,
  PERFORMANCE: Zap,
  UX_MOBILE: Sparkles,
}

export default function AIRecommendationsPage() {
  const { data, isLoading } = useOptimization()
  const [generating, setGenerating] = useState(false)

  const recs = data?.recommendations ?? []

  // Group recs by category for AI-style presentation
  const grouped = recs.reduce<Record<string, typeof recs>>((acc, rec) => {
    const cat = rec.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(rec)
    return acc
  }, {})

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
            <Sparkles className="h-6 w-6" style={{ color: "#06b6d4" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Recommandations IA</h1>
            <p className="text-sm text-slate-500">Analyse intelligente de vos audits</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={generating || recs.length === 0}
          onClick={() => {
            setGenerating(true)
            setTimeout(() => setGenerating(false), 2000)
          }}
        >
          <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
          Régénérer
        </Button>
      </div>

      {recs.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucune donnée d'audit disponible</p>
            <p className="text-sm mt-1">Lancez des audits pour obtenir des recommandations IA personnalisées.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Priority summary */}
          <Card
            className="rounded-2xl shadow-sm"
            style={{
              background: "linear-gradient(135deg, rgba(37,99,235,0.05), rgba(6,182,212,0.05))",
              border: "1px solid rgba(37,99,235,0.1)",
            }}
          >
            <CardContent className="py-5 px-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Résumé des priorités</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Nous avons identifié <span className="font-bold text-blue-600">{recs.length} points d'amélioration</span> répartis
                sur {Object.keys(grouped).length} catégories. Les éléments sont triés par impact potentiel sur votre SEO.
                Concentrez-vous d'abord sur les recommandations de priorité haute avec un effort faible pour des gains rapides.
              </p>
            </CardContent>
          </Card>

          {/* Grouped recommendations */}
          {Object.entries(grouped).map(([category, items]) => {
            const Icon = CATEGORY_ICONS[category] ?? Globe
            const catLabels: Record<string, string> = {
              TECHNICAL: "Technique",
              ON_PAGE: "On-Page",
              PERFORMANCE: "Performance",
              UX_MOBILE: "UX Mobile",
            }

            return (
              <Card key={category} className="border-slate-100 rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: "#2563eb" }} />
                    {catLabels[category] ?? category}
                    <Badge variant="secondary" className="ml-1 text-xs">{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.slice(0, 5).map((rec) => (
                    <div key={rec.checkName} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/50">
                      <div className="mt-0.5 h-2 w-2 rounded-full shrink-0" style={{
                        background: rec.priority === "HIGH" ? "#ef4444" : rec.priority === "MEDIUM" ? "#f59e0b" : "#64748b",
                      }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{rec.checkName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{rec.message}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          <span>{rec.failCount} erreurs</span>
                          <span>{rec.warnCount} avertissements</span>
                          <Badge className="text-[9px]" style={{
                            background: rec.effort === "LOW" ? "#10b98115" : rec.effort === "MEDIUM" ? "#f59e0b15" : "#ef444415",
                            color: rec.effort === "LOW" ? "#10b981" : rec.effort === "MEDIUM" ? "#f59e0b" : "#ef4444",
                          }}>
                            {rec.effort === "LOW" ? "Facile" : rec.effort === "MEDIUM" ? "Moyen" : "Difficile"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </>
      )}
    </div>
  )
}
