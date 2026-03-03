"use client"

import { use } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, ExternalLink, Download } from "lucide-react"
import { useAudit } from "@/hooks/useAudits"
import { ScoreGauge } from "@/components/audit/ScoreGauge"
import { ScoreRadar } from "@/components/audit/ScoreRadar"
import { IssueList } from "@/components/audit/IssueList"
import { AuditProgress } from "@/components/audit/AuditProgress"

interface Props {
  params: Promise<{ id: string }>
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600 font-medium">{label}</span>
        <span className="font-bold tabular-nums" style={{ color }}>{score}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  )
}

export default function AuditDetailPage({ params }: Props) {
  const { id } = use(params)
  const { data: audit, isLoading } = useAudit(id)

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!audit) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Audit introuvable.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/audits">Retour aux audits</Link>
        </Button>
      </div>
    )
  }

  const isRunning = !["COMPLETED", "FAILED", "CANCELLED"].includes(audit.status)

  // Dédoublonner les résultats de toutes les pages
  const allResults = audit.pages.flatMap((p) => p.results)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-500">
              <Link href="/audits">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Audits
              </Link>
            </Button>
          </div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <a
              href={audit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 flex items-center gap-1.5"
            >
              {audit.url}
              <ExternalLink className="h-4 w-4" />
            </a>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Projet : {audit.project.name} · {audit.project.domain}
          </p>
        </div>
        {audit.status === "COMPLETED" && (
          <Button variant="outline" size="sm" onClick={() => {
            const token = document.cookie.match(/better-auth\.session_token=([^;]+)/)?.[1]?.split(".")[0]
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
            const url = `${apiUrl}/api/audits/${id}/pdf`
            fetch(url, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              credentials: "include",
            })
              .then(res => {
                if (!res.ok) throw new Error("Erreur génération PDF")
                return res.blob()
              })
              .then(blob => {
                const a = document.createElement("a")
                a.href = URL.createObjectURL(blob)
                a.download = `audit-seo-${new URL(audit.url).hostname}.pdf`
                a.click()
                URL.revokeObjectURL(a.href)
              })
              .catch(() => alert("Erreur lors de la génération du PDF"))
          }}>
            <Download className="h-4 w-4 mr-2" />
            Télécharger PDF
          </Button>
        )}
      </div>

      {/* Progression si en cours */}
      {isRunning && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <AuditProgress status={audit.status} jobs={audit.jobs} />
          </CardContent>
        </Card>
      )}

      {/* Scores */}
      {audit.report && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Score global */}
            <Card>
              <CardContent className="p-6 flex flex-col items-center justify-center">
                <ScoreGauge score={Math.round(audit.report.scoreGlobal)} size={160} label="Score global" />
                <div className="mt-4 grid grid-cols-3 w-full text-center divide-x divide-slate-100">
                  <div>
                    <p className="text-lg font-bold text-red-500">{audit.report.criticalIssues ?? 0}</p>
                    <p className="text-xs text-slate-400">Critiques</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-orange-500">{audit.report.warnings ?? 0}</p>
                    <p className="text-xs text-slate-400">Warnings</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-500">{audit.report.passed ?? 0}</p>
                    <p className="text-xs text-slate-400">OK</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scores par catégorie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Scores par catégorie</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pb-6">
                <ScoreBar label="Technique"   score={Math.round(audit.report.scoreTechnical)} />
                <ScoreBar label="On-Page"     score={Math.round(audit.report.scoreOnPage)} />
                <ScoreBar label="Performance" score={Math.round(audit.report.scorePerformance)} />
                <ScoreBar label="UX Mobile"   score={Math.round(audit.report.scoreUX)} />
              </CardContent>
            </Card>

            {/* Radar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Vue radar</CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreRadar
                  technical={Math.round(audit.report.scoreTechnical)}
                  onPage={Math.round(audit.report.scoreOnPage)}
                  performance={Math.round(audit.report.scorePerformance)}
                  uxMobile={Math.round(audit.report.scoreUX)}
                />
              </CardContent>
            </Card>
          </div>

          {/* Stats pages */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Pages crawlées", value: audit.report.totalPages ?? 0 },
              { label: "Problèmes total", value: audit.report.totalIssues ?? 0 },
              { label: "Checks passés", value: audit.report.passed ?? 0 },
              { label: "Pages auditées", value: audit.pages.length },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Issues */}
          {allResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Résultats détaillés</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="issues">
                  <TabsList className="mb-4">
                    <TabsTrigger value="issues">Problèmes & checks</TabsTrigger>
                    <TabsTrigger value="pages">Pages ({audit.pages.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="issues">
                    <IssueList results={allResults} />
                  </TabsContent>

                  <TabsContent value="pages">
                    <div className="space-y-2">
                      {audit.pages.map((page) => (
                        <div key={page.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            page.statusCode === 200 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                          }`}>
                            {page.statusCode ?? "—"}
                          </span>
                          <span className="text-sm text-slate-600 truncate">{page.url}</span>
                          <span className="ml-auto text-xs text-slate-400 flex-shrink-0">
                            {page.results.length} checks
                          </span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Échec */}
      {audit.status === "FAILED" && (
        <Card className="border-red-100">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 font-medium">L&apos;audit a échoué.</p>
            <p className="text-sm text-slate-500 mt-1">Vérifiez que l&apos;URL est accessible et relancez.</p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/audits">Retour aux audits</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
