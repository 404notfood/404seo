"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AlertTriangle, XCircle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react"
import type { PageResult } from "@/lib/api-client"

interface IssueListProps {
  results: PageResult[]
}

const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL: "Technique",
  ON_PAGE: "On-Page",
  PERFORMANCE: "Performance",
  UX_MOBILE: "UX Mobile",
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

type FilterStatus = "ALL" | "FAIL" | "WARN" | "PASS"
type FilterCategory = "ALL" | "TECHNICAL" | "ON_PAGE" | "PERFORMANCE" | "UX_MOBILE"

export function IssueList({ results }: IssueListProps) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALL")
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>("ALL")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filtered = results.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false
    return true
  })

  // Trier : FAIL HIGH → FAIL MEDIUM → WARN → PASS
  const sorted = [...filtered].sort((a, b) => {
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

  const countFail = results.filter((r) => r.status === "FAIL").length
  const countWarn = results.filter((r) => r.status === "WARN").length
  const countPass = results.filter((r) => r.status === "PASS").length

  return (
    <div className="space-y-3">
      {/* Filtres statut */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "FAIL", "WARN", "PASS"] as FilterStatus[]).map((s) => {
          const count = s === "ALL" ? results.length : s === "FAIL" ? countFail : s === "WARN" ? countWarn : countPass
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                statusFilter === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              )}
            >
              {s === "ALL" ? "Tous" : s === "FAIL" ? "Erreurs" : s === "WARN" ? "Avertissements" : "OK"}
              <span className="ml-1.5 opacity-70">({count})</span>
            </button>
          )
        })}

        <div className="ml-auto flex gap-2">
          {(["ALL", "TECHNICAL", "ON_PAGE", "PERFORMANCE", "UX_MOBILE"] as FilterCategory[]).map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                categoryFilter === c
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              )}
            >
              {c === "ALL" ? "Toutes" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {sorted.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          Aucun résultat pour ces filtres
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.map((result) => {
          const { icon: Icon, color, bg } = STATUS_CONFIG[result.status]
          const isExpanded = expanded.has(result.id)
          const priority = PRIORITY_CONFIG[result.priority]

          return (
            <div
              key={result.id}
              className="rounded-lg border border-slate-100 bg-white overflow-hidden"
            >
              <button
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 transition-colors"
                onClick={() => toggleExpand(result.id)}
              >
                <div className={cn("h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center", bg)}>
                  <Icon className={cn("h-4 w-4", color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {result.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">
                      {CATEGORY_LABELS[result.category]}
                    </span>
                    {result.value && (
                      <span className="text-xs text-slate-400">· {result.value}</span>
                    )}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn("text-xs flex-shrink-0", priority.className)}
                >
                  {priority.label}
                </Badge>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 pt-0 border-t border-slate-50 bg-slate-50/50">
                  <div className="pl-10 space-y-1 pt-2">
                    {result.expected && (
                      <p className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">Attendu :</span>{" "}
                        {result.expected}
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">Score :</span>{" "}
                      {result.score}/100
                    </p>
                    <p className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">Effort :</span>{" "}
                      {result.effort === "LOW" ? "Faible" : result.effort === "MEDIUM" ? "Moyen" : "Élevé"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
