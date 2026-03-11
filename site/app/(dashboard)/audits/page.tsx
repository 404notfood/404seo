"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Clock, CheckCircle, XCircle, Loader2, ExternalLink, Trash2, Zap, Monitor, Smartphone, ChevronDown, ChevronUp, Settings2, FolderOpen } from "lucide-react"
import { useAudits, useLaunchAudit, useDeleteAudit } from "@/hooks/useAudits"
import { useRole } from "@/hooks/useMe"
import { useActiveProject } from "@/contexts/ProjectContext"
import type { AuditStatus } from "@/lib/api-client"
import { formatDistanceToNow } from "@/lib/date"

const STATUS_CONFIG: Record<AuditStatus, { label: string; dot: string; icon: React.ElementType; spinning?: boolean }> = {
  PENDING:           { label: "En attente",  dot: "#64748b", icon: Clock },
  CRAWLING:          { label: "Crawl…",      dot: "#2563eb", icon: Loader2, spinning: true },
  ANALYZING:         { label: "Analyse…",    dot: "#06b6d4", icon: Loader2, spinning: true },
  SCORING:           { label: "Scoring…",    dot: "#06b6d4", icon: Loader2, spinning: true },
  GENERATING_REPORT: { label: "Rapport…",   dot: "#8b5cf6", icon: Loader2, spinning: true },
  COMPLETED:         { label: "Terminé",     dot: "#10b981", icon: CheckCircle },
  FAILED:            { label: "Échoué",      dot: "#ef4444", icon: XCircle },
  CANCELLED:         { label: "Annulé",      dot: "#94a3b8", icon: XCircle },
}

function scoreColor(score: number) {
  if (score >= 70) return "#10b981"
  if (score >= 40) return "#f59e0b"
  return "#ef4444"
}

export default function AuditsPage() {
  const [showOptions, setShowOptions] = useState(false)
  const [maxPages, setMaxPages] = useState(100)
  const [maxDepth, setMaxDepth] = useState(5)
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")

  const router = useRouter()
  const { activeProjectId, activeProject } = useActiveProject()
  const { data: audits, isLoading } = useAudits(activeProjectId)
  const { mutate: launchAudit, isPending } = useLaunchAudit({
    onAuditCreated: (auditId) => router.push(`/audits/${auditId}`),
  })
  const { mutate: deleteAudit } = useDeleteAudit()
  const { isMember, isAdmin } = useRole()

  function handleLaunch(e: React.FormEvent) {
    e.preventDefault()
    if (!activeProjectId) return
    launchAudit({ projectId: activeProjectId, options: { maxPages, maxDepth, device } })
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a" }}>Audits SEO</h1>
        <p className="text-sm text-slate-400 mt-1">Lancez et suivez vos audits techniques</p>
      </div>

      {/* Form lancement — MEMBER+ seulement */}
      {isMember && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(37,99,235,0.1)" }}>
              <Zap className="h-3.5 w-3.5" style={{ color: "#2563eb" }} />
            </div>
            <h2 className="text-sm font-semibold text-slate-800">Lancer un nouvel audit</h2>
          </div>

          {!activeProject ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-slate-200 text-slate-400">
              <FolderOpen className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Aucun projet sélectionné</p>
                <p className="text-xs mt-0.5">
                  Sélectionnez un projet dans la barre latérale ou{" "}
                  <Link href="/projects" className="font-semibold hover:underline" style={{ color: "#2563eb" }}>créez-en un</Link>.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLaunch}>
              {/* Projet + URL en lecture seule */}
              <div className="flex items-center gap-3 mb-3 p-3 rounded-xl" style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.1)" }}>
                <FolderOpen className="h-4 w-4 shrink-0" style={{ color: "#2563eb" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700">{activeProject.name}</p>
                  <p className="text-xs text-slate-400 truncate">{activeProject.domain}</p>
                </div>
                <Button type="submit" disabled={isPending} className="btn-glow shrink-0" style={{ background: "#2563eb" }}>
                  {isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Lancement…</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" />Analyser</>
                  )}
                </Button>
              </div>

              {/* Options avancées */}
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Settings2 className="h-3 w-3" />
                Options avancées
                {showOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {showOptions && (
                <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-100 grid grid-cols-3 gap-4">
                  {/* Nombre de pages */}
                  <div className="space-y-1.5">
                    <Label htmlFor="maxPages" className="text-xs font-medium text-slate-600">Nombre de pages</Label>
                    <Input
                      id="maxPages"
                      type="number"
                      min={1}
                      max={500}
                      value={maxPages}
                      onChange={(e) => setMaxPages(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                      className="bg-white border-slate-200 text-sm h-9"
                    />
                    <p className="text-[10px] text-slate-400">1 – 500 pages max</p>
                  </div>

                  {/* Profondeur */}
                  <div className="space-y-1.5">
                    <Label htmlFor="maxDepth" className="text-xs font-medium text-slate-600">Profondeur</Label>
                    <Input
                      id="maxDepth"
                      type="number"
                      min={1}
                      max={10}
                      value={maxDepth}
                      onChange={(e) => setMaxDepth(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="bg-white border-slate-200 text-sm h-9"
                    />
                    <p className="text-[10px] text-slate-400">1 – 10 niveaux</p>
                  </div>

                  {/* Device */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">Appareil</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={device === "desktop" ? "default" : "outline"}
                        className={`flex-1 h-9 text-xs gap-1.5 ${device === "desktop" ? "btn-glow" : ""}`}
                        style={device === "desktop" ? { background: "#2563eb" } : {}}
                        onClick={() => setDevice("desktop")}
                      >
                        <Monitor className="h-3.5 w-3.5" />Desktop
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={device === "mobile" ? "default" : "outline"}
                        className={`flex-1 h-9 text-xs gap-1.5 ${device === "mobile" ? "btn-glow" : ""}`}
                        style={device === "mobile" ? { background: "#2563eb" } : {}}
                        onClick={() => setDevice("mobile")}
                      >
                        <Smartphone className="h-3.5 w-3.5" />Mobile
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* Liste */}
      {isLoading && (
        <div className="space-y-2">
          {[1,2,3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100">
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && (!audits || audits.length === 0) && (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center">
          <div className="h-14 w-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(37,99,235,0.07)" }}>
            <Search className="h-7 w-7" style={{ color: "#2563eb" }} />
          </div>
          <h3 className="font-semibold mb-1" style={{ color: "#0f172a" }}>
            {activeProject ? `Aucun audit pour ${activeProject.name}` : "Aucun audit pour le moment"}
          </h3>
          <p className="text-sm text-slate-400">Lancez votre premier audit ci-dessus</p>
        </div>
      )}

      {audits && audits.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="divide-y divide-slate-50">
            {audits.map((audit) => {
              const cfg = STATUS_CONFIG[audit.status]
              const StatusIcon = cfg.icon
              const isDone = audit.status === "COMPLETED"

              return (
                <div key={audit.id} className="flex items-center px-5 py-4 hover:bg-slate-50/60 transition-colors group">

                  {/* Score circle */}
                  <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center mr-4 font-bold text-sm transition-transform group-hover:scale-105"
                    style={{
                      background: audit.report ? `${scoreColor(audit.report.scoreGlobal)}12` : "#f8fafc",
                      color: audit.report ? scoreColor(audit.report.scoreGlobal) : "#cbd5e1",
                      border: `2px solid ${audit.report ? scoreColor(audit.report.scoreGlobal) + "35" : "#e2e8f0"}`,
                    }}
                  >
                    {audit.report ? audit.report.scoreGlobal : "—"}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={audit.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-semibold truncate flex items-center gap-1.5 hover:opacity-70 transition-opacity"
                        style={{ color: "#0f172a" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {audit.url}
                        <ExternalLink className="h-3 w-3 shrink-0 text-slate-300" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{audit.project.name}</span>
                      <span className="text-slate-200">·</span>
                      <span className="text-xs text-slate-400">{formatDistanceToNow(audit.createdAt)}</span>
                      {(audit.report?.criticalIssues ?? 0) > 0 && (
                        <>
                          <span className="text-slate-200">·</span>
                          <span className="text-xs font-semibold" style={{ color: "#ef4444" }}>
                            {audit.report!.criticalIssues} critique{(audit.report!.criticalIssues ?? 0) > 1 ? "s" : ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Statut + actions */}
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: cfg.dot }}>
                      <StatusIcon className={`h-3.5 w-3.5 ${cfg.spinning ? "animate-spin" : ""}`} />
                      {cfg.label}
                    </span>

                    {isDone && (
                      <Button asChild size="sm" variant="outline" className="text-xs h-7 px-3 hover:border-blue-300 hover:text-blue-600">
                        <Link href={`/audits/${audit.id}`}>Rapport →</Link>
                      </Button>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => deleteAudit(audit.id)}
                        className="p-1.5 rounded-md transition-colors text-slate-200 hover:text-red-400 hover:bg-red-50"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
