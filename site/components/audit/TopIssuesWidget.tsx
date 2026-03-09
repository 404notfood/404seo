"use client"

import { Badge } from "@/components/ui/badge"
import { getCheckLabel, CATEGORY_LABELS } from "@/lib/check-labels"

interface TopIssue {
  checkName: string
  category: string
  failCount: number
  warnCount: number
  maxPriority: string
  score: number
}

interface TopIssuesWidgetProps {
  issues: TopIssue[]
  totalPages: number
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-orange-50 text-orange-700 border-orange-200",
  LOW: "bg-slate-50 text-slate-600 border-slate-200",
}

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "Critique",
  MEDIUM: "Moyen",
  LOW: "Faible",
}

export function TopIssuesWidget({ issues, totalPages }: TopIssuesWidgetProps) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-slate-400">
        Aucun problème détecté
      </div>
    )
  }

  const maxScore = issues[0]?.score ?? 1

  return (
    <div className="space-y-3">
      {issues.map((issue) => {
        const affectedPages = issue.failCount + issue.warnCount
        const percentage = totalPages > 0 ? Math.round((affectedPages / totalPages) * 100) : 0
        const barWidth = maxScore > 0 ? Math.max((issue.score / maxScore) * 100, 8) : 8

        return (
          <div key={issue.checkName} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-slate-800 truncate">
                  {getCheckLabel(issue.checkName)}
                </span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${PRIORITY_COLORS[issue.maxPriority]}`}>
                  {PRIORITY_LABELS[issue.maxPriority] ?? issue.maxPriority}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-slate-400">
                  {CATEGORY_LABELS[issue.category] ?? issue.category}
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {affectedPages} page{affectedPages > 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${barWidth}%`,
                    background: issue.maxPriority === "HIGH" ? "#ef4444" : issue.maxPriority === "MEDIUM" ? "#f59e0b" : "#94a3b8",
                  }}
                />
              </div>
              <span className="text-[11px] font-medium text-slate-500 tabular-nums w-8 text-right">
                {percentage}%
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
