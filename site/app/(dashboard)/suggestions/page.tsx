"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Lightbulb, ArrowRight } from "lucide-react"
import { useOptimization } from "@/hooks/useAggregation"
import { useActiveProject } from "@/contexts/ProjectContext"

// Impact/Effort matrix quadrants
function getQuadrant(priority: string, effort: string): { label: string; color: string; bg: string; order: number } {
  if ((priority === "HIGH") && (effort === "LOW"))
    return { label: "Quick Win", color: "#10b981", bg: "#10b98110", order: 1 }
  if ((priority === "HIGH") && (effort === "MEDIUM" || effort === "HIGH"))
    return { label: "Projet majeur", color: "#2563eb", bg: "#2563eb10", order: 2 }
  if ((priority === "MEDIUM" || priority === "LOW") && (effort === "LOW"))
    return { label: "Amélioration facile", color: "#06b6d4", bg: "#06b6d410", order: 3 }
  return { label: "À planifier", color: "#64748b", bg: "#64748b10", order: 4 }
}

export default function SuggestionsPage() {
  const { activeProjectId } = useActiveProject()
  const { data, isLoading } = useOptimization(activeProjectId)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    )
  }

  const recs = data?.recommendations ?? []

  // Sort into quadrants
  const withQuadrant = recs.map((r) => ({
    ...r,
    quadrant: getQuadrant(r.priority, r.effort),
  })).sort((a, b) => a.quadrant.order - b.quadrant.order || b.impactScore - a.impactScore)

  // Group by quadrant
  const groups = withQuadrant.reduce<Record<string, typeof withQuadrant>>((acc, item) => {
    const key = item.quadrant.label
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <Lightbulb className="h-6 w-6" style={{ color: "#f59e0b" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suggestions d'action</h1>
          <p className="text-sm text-slate-500">Plan d'action priorisé — matrice impact/effort</p>
        </div>
      </div>

      {recs.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <Lightbulb className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucune suggestion disponible</p>
            <p className="text-sm mt-1">Lancez des audits pour obtenir des suggestions d'action.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groups).map(([quadrantLabel, items]) => {
          const q = items[0].quadrant
          return (
            <Card key={quadrantLabel} className="border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <CardHeader className="pb-3" style={{ background: q.bg }}>
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ background: q.color }} />
                  {quadrantLabel}
                  <Badge variant="secondary" className="ml-1 text-xs">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2">
                {items.map((rec, i) => (
                  <div
                    key={rec.checkName}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50/50 transition-colors"
                  >
                    <span className="text-xs font-mono text-slate-400 w-6 shrink-0">{i + 1}.</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: q.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{rec.checkName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{rec.message}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="text-[10px]" style={{
                        background: rec.priority === "HIGH" ? "#ef444415" : rec.priority === "MEDIUM" ? "#f59e0b15" : "#64748b15",
                        color: rec.priority === "HIGH" ? "#ef4444" : rec.priority === "MEDIUM" ? "#f59e0b" : "#64748b",
                      }}>
                        {rec.failCount + rec.warnCount} issues
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
