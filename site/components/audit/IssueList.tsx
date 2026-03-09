"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { AlertTriangle, XCircle, CheckCircle, ChevronDown, ChevronUp, Lightbulb } from "lucide-react"
import { CATEGORY_LABELS, CHECK_ADVICE, getCheckLabel } from "@/lib/check-labels"
import type { PageResult } from "@/lib/api-client"

interface IssueListProps {
  results: PageResult[]
  compact?: boolean
}

const PRIORITY_CONFIG = {
  HIGH: { label: "Critique", className: "bg-red-50 text-red-700 border-red-200" },
  MEDIUM: { label: "Moyen", className: "bg-orange-50 text-orange-700 border-orange-200" },
  LOW: { label: "Faible", className: "bg-slate-50 text-slate-600 border-slate-200" },
}

const STATUS_CONFIG = {
  FAIL: { icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
  WARN: { icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
  PASS: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50" },
}

function MiniScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>
        {score}/100
      </span>
    </div>
  )
}

export function IssueList({ results, compact = false }: IssueListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Trier : FAIL HIGH → FAIL MEDIUM → WARN → PASS
  const sorted = [...results].sort((a, b) => {
    const statusOrder = { FAIL: 0, WARN: 1, PASS: 2 }
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
    if (statusOrder[a.status] !== statusOrder[b.status])
      return statusOrder[a.status] - statusOrder[b.status]
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (compact) {
    return (
      <div className="space-y-1">
        {sorted.map((result) => {
          const { icon: Icon, color, bg } = STATUS_CONFIG[result.status]
          return (
            <div key={result.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover:bg-slate-50">
              <div className={cn("h-5 w-5 rounded-full flex-shrink-0 flex items-center justify-center", bg)}>
                <Icon className={cn("h-3 w-3", color)} />
              </div>
              <span className="text-sm text-slate-700 truncate">{getCheckLabel(result.checkName)}</span>
              <span className="ml-auto text-xs font-bold tabular-nums" style={{
                color: result.score >= 75 ? "#10b981" : result.score >= 50 ? "#f59e0b" : "#ef4444"
              }}>
                {result.score}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sorted.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          Aucun résultat dans cette section
        </div>
      )}

      {sorted.map((result) => {
        const { icon: Icon, color, bg } = STATUS_CONFIG[result.status]
        const isExpanded = expanded.has(result.id)
        const priority = PRIORITY_CONFIG[result.priority]
        const advice = CHECK_ADVICE[result.checkName]

        return (
          <div
            key={result.id}
            className="rounded-xl border border-slate-100 bg-white overflow-hidden"
          >
            {/* Header cliquable */}
            <button
              className="w-full text-left p-4 hover:bg-slate-50/50 transition-colors"
              onClick={() => toggleExpand(result.id)}
            >
              <div className="flex items-start gap-3">
                <div className={cn("h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5", bg)}>
                  <Icon className={cn("h-4 w-4", color)} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Nom du check + badge priorité */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">
                      {getCheckLabel(result.checkName)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] px-1.5 py-0", priority.className)}
                    >
                      {priority.label}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {CATEGORY_LABELS[result.category]}
                    </span>
                  </div>

                  {/* Message */}
                  <p className="text-sm text-slate-600 mt-0.5">{result.message}</p>

                  {/* Value / Expected - toujours visible */}
                  {(result.value || result.expected) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                      {result.value && (
                        <span className="text-xs font-medium text-slate-700">
                          Votre valeur : <span className="text-slate-900">{result.value}</span>
                        </span>
                      )}
                      {result.expected && (
                        <span className="text-xs font-medium text-slate-500">
                          Recommandé : <span className="text-blue-600">{result.expected}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Mini barre de score */}
                  <MiniScoreBar score={result.score} />
                </div>

                {/* Chevron */}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                )}
              </div>
            </button>

            {/* Section expand : conseil actionable */}
            {isExpanded && (
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3">
                <div className="pl-11 space-y-2">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      <span className="font-medium text-slate-700">Score :</span> {result.score}/100
                    </span>
                    <span>
                      <span className="font-medium text-slate-700">Effort :</span>{" "}
                      {result.effort === "LOW" ? "Faible" : result.effort === "MEDIUM" ? "Moyen" : "Élevé"}
                    </span>
                  </div>

                  {advice && (
                    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <Lightbulb className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800 leading-relaxed">{advice}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
