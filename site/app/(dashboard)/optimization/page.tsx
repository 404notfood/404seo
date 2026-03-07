"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Globe, CheckCircle2, Circle } from "lucide-react"
import { useOptimization } from "@/hooks/useAggregation"
import { useActiveProject } from "@/contexts/ProjectContext"

const CAT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  TECHNICAL: { bg: "#2563eb15", text: "#2563eb", label: "Technique" },
  ON_PAGE: { bg: "#10b98115", text: "#10b981", label: "On-Page" },
  PERFORMANCE: { bg: "#f59e0b15", text: "#f59e0b", label: "Performance" },
  UX_MOBILE: { bg: "#7c3aed15", text: "#7c3aed", label: "UX Mobile" },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  HIGH: { bg: "#ef444415", text: "#ef4444", label: "Haute" },
  MEDIUM: { bg: "#f59e0b15", text: "#f59e0b", label: "Moyenne" },
  LOW: { bg: "#64748b15", text: "#64748b", label: "Basse" },
}

const EFFORT_LABELS: Record<string, { label: string; color: string }> = {
  LOW: { label: "Facile", color: "#10b981" },
  MEDIUM: { label: "Moyen", color: "#f59e0b" },
  HIGH: { label: "Difficile", color: "#ef4444" },
}

export default function OptimizationPage() {
  const { activeProjectId } = useActiveProject()
  const { data, isLoading } = useOptimization(activeProjectId)
  const [done, setDone] = useState<Set<string>>(new Set())

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  }

  const recs = data?.recommendations ?? []
  const maxImpact = recs.length > 0 ? recs[0].impactScore : 1

  function toggleDone(checkName: string) {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(checkName)) next.delete(checkName)
      else next.add(checkName)
      return next
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <Globe className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Optimisation globale</h1>
          <p className="text-sm text-slate-500">Recommandations triées par impact/effort</p>
        </div>
      </div>

      {recs.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            Aucune recommandation. Lancez des audits pour obtenir des recommandations d'optimisation.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {recs.map((rec) => {
            const isDone = done.has(rec.checkName)
            const cat = CAT_COLORS[rec.category] ?? CAT_COLORS.TECHNICAL
            const pri = PRIORITY_COLORS[rec.priority] ?? PRIORITY_COLORS.MEDIUM
            const eff = EFFORT_LABELS[rec.effort] ?? EFFORT_LABELS.MEDIUM

            return (
              <Card
                key={rec.checkName}
                className={`border-slate-100 rounded-2xl shadow-sm transition-opacity ${isDone ? "opacity-50" : ""}`}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button onClick={() => toggleDone(rec.checkName)} className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-300" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>
                          {rec.checkName}
                        </span>
                        <Badge style={{ background: cat.bg, color: cat.text }} className="text-[10px]">
                          {cat.label}
                        </Badge>
                        <Badge style={{ background: pri.bg, color: pri.text }} className="text-[10px]">
                          {pri.label}
                        </Badge>
                        <Badge style={{ background: `${eff.color}15`, color: eff.color }} className="text-[10px]">
                          {eff.label}
                        </Badge>
                      </div>

                      <p className="text-xs text-slate-500">{rec.message}</p>

                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span><span className="font-semibold text-red-500">{rec.failCount}</span> erreurs</span>
                        <span><span className="font-semibold text-orange-500">{rec.warnCount}</span> avertissements</span>
                      </div>

                      {/* Impact bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 shrink-0">Impact</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.round((rec.impactScore / maxImpact) * 100)}%`,
                              background: "linear-gradient(90deg, #2563eb, #06b6d4)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
