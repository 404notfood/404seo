"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { FileText, Download, ExternalLink } from "lucide-react"
import { useAudits } from "@/hooks/useAudits"
import { useActiveProject } from "@/contexts/ProjectContext"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

function scoreColor(s: number) {
  return s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444"
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

export default function ReportsPage() {
  const { activeProjectId } = useActiveProject()
  const { data: audits, isLoading } = useAudits(activeProjectId)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    )
  }

  const completed = audits?.filter((a) => a.status === "COMPLETED") ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <FileText className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rapports PDF</h1>
          <p className="text-sm text-slate-500">Téléchargez les rapports de vos audits complétés</p>
        </div>
      </div>

      {completed.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            Aucun rapport disponible. Lancez un audit pour générer un rapport.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {completed.map((audit) => {
            const score = audit.report?.scoreGlobal ?? 0
            const color = scoreColor(score)

            return (
              <Card key={audit.id} className="border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-4">
                    {/* Score circle */}
                    <div
                      className="h-12 w-12 rounded-full flex items-center justify-center shrink-0 font-bold text-sm"
                      style={{ background: `${color}15`, color }}
                    >
                      {Math.round(score)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <a
                          href={audit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-slate-800 hover:text-blue-600 truncate flex items-center gap-1"
                        >
                          {audit.url}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500">{fmtDate(audit.createdAt)}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {audit.project.name}
                        </Badge>
                      </div>
                    </div>

                    {/* Download */}
                    <Button
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => window.open(`${API_URL}/api/audits/${audit.id}/pdf`, "_blank")}
                    >
                      <Download className="h-4 w-4" />
                      Télécharger PDF
                    </Button>
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
