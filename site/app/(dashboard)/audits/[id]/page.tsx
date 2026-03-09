"use client"

import { use, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, ExternalLink, Download, AlertTriangle, XCircle, CheckCircle, Gauge, Globe, ImageIcon, LinkIcon, Link2, ShieldCheck, Search } from "lucide-react"
import { useAudit, useAuditBreakdown } from "@/hooks/useAudits"
import { ScoreGauge } from "@/components/audit/ScoreGauge"
import { ScoreRadar } from "@/components/audit/ScoreRadar"
import { IssueList } from "@/components/audit/IssueList"
import { AuditProgress } from "@/components/audit/AuditProgress"
import { PagesBreakdownDonut } from "@/components/audit/PagesBreakdownDonut"
import { TopIssuesWidget } from "@/components/audit/TopIssuesWidget"
import { ThematicSection } from "@/components/audit/ThematicSection"
import { PagesTable } from "@/components/audit/PagesTable"
import { KeywordsTab } from "@/components/audit/KeywordsTab"
import { apiClient } from "@/lib/api-client"
import type { PageResult } from "@/lib/api-client"

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

/* ——— Métrique Performance (grille) ——— */
interface PerfMetricProps {
  icon: React.ReactNode
  label: string
  value: string | null
  expected: string | null
  score: number
  status: "PASS" | "WARN" | "FAIL"
}

function PerfMetric({ icon, label, value, expected, score, status }: PerfMetricProps) {
  const statusColor = status === "PASS" ? "text-emerald-600" : status === "WARN" ? "text-orange-500" : "text-red-500"
  const barColor = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"

  return (
    <div className="p-3 rounded-xl border border-slate-100 bg-white space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-slate-400">{icon}</div>
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className={`ml-auto text-xs font-bold ${statusColor}`}>
          {status === "PASS" ? "OK" : status === "WARN" ? "Moyen" : "Critique"}
        </span>
      </div>
      {value && (
        <p className="text-lg font-bold text-slate-900 leading-none">{value}</p>
      )}
      {expected && (
        <p className="text-[11px] text-slate-400">Recommandé : <span className="text-blue-600 font-medium">{expected}</span></p>
      )}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: barColor }}
        />
      </div>
    </div>
  )
}

/* ——— Config métrique Performance par checkName ——— */
const PERF_METRICS_CONFIG: Array<{
  checkName: string
  label: string
  icon: React.ReactNode
}> = [
  { checkName: "response_time", label: "Temps de réponse", icon: <Gauge className="h-4 w-4" /> },
  { checkName: "page_size", label: "Poids de page", icon: <Globe className="h-4 w-4" /> },
  { checkName: "image_optimization", label: "Images optimisées", icon: <ImageIcon className="h-4 w-4" /> },
  { checkName: "internal_links", label: "Liens internes", icon: <LinkIcon className="h-4 w-4" /> },
  { checkName: "external_links", label: "Liens externes", icon: <Link2 className="h-4 w-4" /> },
  { checkName: "https_resources", label: "Ressources HTTPS", icon: <ShieldCheck className="h-4 w-4" /> },
]

export default function AuditDetailPage({ params }: Props) {
  const { id } = use(params)
  const { data: audit, isLoading } = useAudit(id)
  const isCompleted = audit?.status === "COMPLETED"
  const { data: breakdownData } = useAuditBreakdown(id, isCompleted)

  const scrollTo = useCallback((anchorId: string) => {
    const el = document.getElementById(anchorId)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

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

  // Classement par statut
  const critiques = allResults.filter((r) => r.status === "FAIL" && r.priority === "HIGH")
  const avertissements = allResults.filter((r) => r.status === "WARN" || (r.status === "FAIL" && r.priority !== "HIGH"))
  const reussis = allResults.filter((r) => r.status === "PASS")

  // Métriques performance
  const perfResults = allResults.filter((r) => r.category === "PERFORMANCE")
  const perfMetrics = PERF_METRICS_CONFIG.map((cfg) => {
    const check = perfResults.find((r) => r.checkName === cfg.checkName)
    return check ? { ...cfg, check } : null
  }).filter((m): m is { checkName: string; label: string; icon: React.ReactNode; check: PageResult } => m !== null)

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
            apiClient.downloadAuditPdf(id, new URL(audit.url).hostname)
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

          {/* NOUVEAU — Donut Pages Breakdown + Top Issues */}
          {breakdownData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Répartition des pages</CardTitle>
                </CardHeader>
                <CardContent>
                  <PagesBreakdownDonut
                    healthy={breakdownData.breakdown.healthy}
                    redirects={breakdownData.breakdown.redirects}
                    errors={breakdownData.breakdown.errors}
                    blocked={breakdownData.breakdown.blocked}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">Top problèmes</CardTitle>
                </CardHeader>
                <CardContent>
                  <TopIssuesWidget issues={breakdownData.topIssues} totalPages={breakdownData.totalPages} />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Barre de navigation rapide (ancres) */}
          {allResults.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={() => scrollTo("critiques")}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Critiques ({critiques.length})
              </button>
              <button
                onClick={() => scrollTo("avertissements")}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium hover:bg-orange-100 transition-colors"
              >
                <AlertTriangle className="h-4 w-4" />
                Avertissements ({avertissements.length})
              </button>
              <button
                onClick={() => scrollTo("reussis")}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Réussis ({reussis.length})
              </button>
            </div>
          )}

          {/* Section Performance dédiée */}
          {perfMetrics.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <ScoreGauge score={Math.round(audit.report.scorePerformance)} size={64} />
                  <div>
                    <CardTitle className="text-base">Métriques Performance</CardTitle>
                    <p className="text-xs text-slate-400 mt-0.5">Détail des indicateurs de vitesse et optimisation</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {perfMetrics.map(({ checkName, label, icon, check }) => (
                    <PerfMetric
                      key={checkName}
                      icon={icon}
                      label={label}
                      value={check.value}
                      expected={check.expected}
                      score={check.score}
                      status={check.status}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* === TABS : Par statut | Technique | Contenu | Performance | UX Mobile | Toutes les pages === */}
          <Tabs defaultValue="status" className="mb-8">
            <TabsList className="mb-4">
              <TabsTrigger value="status">Par statut</TabsTrigger>
              <TabsTrigger value="technical">Technique</TabsTrigger>
              <TabsTrigger value="content">Contenu</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="ux">UX Mobile</TabsTrigger>
              <TabsTrigger value="keywords">Mots-clés</TabsTrigger>
              <TabsTrigger value="pages">Toutes les pages</TabsTrigger>
            </TabsList>

            {/* Tab : Par statut */}
            <TabsContent value="status" className="space-y-8">
              {/* Section Critiques */}
              {critiques.length > 0 && (
                <section id="critiques" className="scroll-mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                      <XCircle className="h-4 w-4 text-red-500" />
                    </div>
                    <h2 className="text-lg font-bold text-red-700">
                      Problèmes critiques
                    </h2>
                    <span className="text-sm font-medium text-red-400 ml-1">({critiques.length})</span>
                  </div>
                  <IssueList results={critiques} />
                </section>
              )}

              {/* Section Avertissements */}
              {avertissements.length > 0 && (
                <section id="avertissements" className="scroll-mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                    </div>
                    <h2 className="text-lg font-bold text-orange-700">
                      Avertissements
                    </h2>
                    <span className="text-sm font-medium text-orange-400 ml-1">({avertissements.length})</span>
                  </div>
                  <IssueList results={avertissements} />
                </section>
              )}

              {/* Section Réussis */}
              {reussis.length > 0 && (
                <section id="reussis" className="scroll-mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    </div>
                    <h2 className="text-lg font-bold text-emerald-700">
                      Checks réussis
                    </h2>
                    <span className="text-sm font-medium text-emerald-400 ml-1">({reussis.length})</span>
                  </div>
                  <IssueList results={reussis} compact />
                </section>
              )}
            </TabsContent>

            {/* Tab : Technique */}
            <TabsContent value="technical">
              <ThematicSection
                category="TECHNICAL"
                score={audit.report.scoreTechnical}
                results={allResults}
              />
            </TabsContent>

            {/* Tab : Contenu */}
            <TabsContent value="content">
              <ThematicSection
                category="ON_PAGE"
                score={audit.report.scoreOnPage}
                results={allResults}
              />
            </TabsContent>

            {/* Tab : Performance */}
            <TabsContent value="performance">
              <ThematicSection
                category="PERFORMANCE"
                score={audit.report.scorePerformance}
                results={allResults}
              />
            </TabsContent>

            {/* Tab : UX Mobile */}
            <TabsContent value="ux">
              <ThematicSection
                category="UX_MOBILE"
                score={audit.report.scoreUX}
                results={allResults}
              />
            </TabsContent>

            {/* Tab : Mots-clés */}
            <TabsContent value="keywords">
              <KeywordsTab auditId={id} enabled={isCompleted} />
            </TabsContent>

            {/* Tab : Toutes les pages */}
            <TabsContent value="pages">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Toutes les pages ({audit.pages.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <PagesTable pages={audit.pages} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
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
