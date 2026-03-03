"use client"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { Loader2, CheckCircle } from "lucide-react"
import type { AuditStatus } from "@/lib/api-client"

interface AuditProgressProps {
  status: AuditStatus
  jobs: { type: string; status: string; progress: number }[]
}

const STEPS = [
  { key: "CRAWL", label: "Crawl", status: "CRAWLING" },
  { key: "ANALYZE", label: "Analyse", status: "ANALYZING" },
  { key: "SCORE", label: "Scoring", status: "SCORING" },
  { key: "REPORT", label: "Rapport", status: "GENERATING_REPORT" },
]

const STATUS_LABELS: Record<AuditStatus, string> = {
  PENDING: "En attente...",
  CRAWLING: "Crawl des pages en cours...",
  ANALYZING: "Analyse SEO en cours...",
  SCORING: "Calcul des scores...",
  GENERATING_REPORT: "Génération du rapport...",
  COMPLETED: "Audit terminé",
  FAILED: "Échec de l'audit",
  CANCELLED: "Annulé",
}

export function AuditProgress({ status, jobs }: AuditProgressProps) {
  const isFinished = ["COMPLETED", "FAILED", "CANCELLED"].includes(status)

  // Calcul progression globale
  const crawlJob = jobs.find((j) => j.type === "CRAWL")
  const analyzeJob = jobs.find((j) => j.type === "ANALYZE")
  const reportJob = jobs.find((j) => j.type === "REPORT")

  let globalProgress = 0
  if (status === "COMPLETED") globalProgress = 100
  else if (status === "CRAWLING") globalProgress = (crawlJob?.progress ?? 0) * 0.4
  else if (status === "ANALYZING") globalProgress = 40 + (analyzeJob?.progress ?? 0) * 0.4
  else if (status === "SCORING") globalProgress = 80
  else if (status === "GENERATING_REPORT") globalProgress = 90

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isFinished && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          )}
          {status === "COMPLETED" && (
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          )}
          <span className="text-sm font-medium text-slate-700">
            {STATUS_LABELS[status]}
          </span>
        </div>
        <span className="text-sm text-slate-500 tabular-nums">
          {Math.round(globalProgress)}%
        </span>
      </div>

      <Progress value={globalProgress} className="h-2" />

      {/* Étapes */}
      <div className="flex gap-2">
        {STEPS.map((step, i) => {
          const job = jobs.find((j) => j.type === step.key)
          const isDone = job?.status === "COMPLETED" || status === "COMPLETED"
          const isActive = status === step.status
          const isPending = !isDone && !isActive

          return (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                  isDone && "bg-emerald-500 text-white",
                  isActive && "bg-blue-600 text-white",
                  isPending && "bg-slate-100 text-slate-400"
                )}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span className={cn("text-xs", isActive ? "text-blue-600 font-medium" : "text-slate-400")}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
