"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, ArrowUp, ArrowDown, Minus, Plus, Trash2, RefreshCw, Loader2 } from "lucide-react"
import { useRankTracking, useAddKeyword, useDeleteKeyword, useCheckAllPositions, useCheckKeywordPosition } from "@/hooks/useRankTracking"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) return <span className="text-slate-400 text-xs">—</span>
  if (change > 0) return <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-semibold"><ArrowUp className="h-3 w-3" />+{change}</span>
  if (change < 0) return <span className="flex items-center gap-0.5 text-red-500 text-xs font-semibold"><ArrowDown className="h-3 w-3" />{change}</span>
  return <span className="flex items-center gap-0.5 text-slate-400 text-xs"><Minus className="h-3 w-3" />0</span>
}

function PositionBadge({ pos }: { pos: number | null }) {
  if (pos === null) return <Badge variant="secondary" className="text-xs">—</Badge>
  const color = pos <= 3 ? "#10b981" : pos <= 10 ? "#2563eb" : pos <= 30 ? "#f59e0b" : "#94a3b8"
  return (
    <Badge style={{ background: `${color}18`, color }} className="text-xs font-bold min-w-[2rem] justify-center">
      {pos}
    </Badge>
  )
}

export default function RankTrackingPage() {
  const { activeProjectId } = useActiveProject()
  const { data: projects } = useProjects()
  const { data, isLoading, refetch } = useRankTracking(activeProjectId)
  const { mutate: addKeyword, isPending: isAdding } = useAddKeyword()
  const { mutate: deleteKeyword } = useDeleteKeyword()
  const { mutate: checkAll, isPending: isCheckingAll } = useCheckAllPositions()
  const { mutate: checkOne, isPending: isCheckingOne } = useCheckKeywordPosition()

  const [newKw, setNewKw] = useState("")
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")

  const activeProject = projects?.find((p) => p.id === activeProjectId)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newKw.trim()) return
    addKeyword(
      { keyword: newKw.trim(), device, country: "fr", projectId: activeProjectId ?? undefined },
      { onSuccess: () => setNewKw("") }
    )
  }

  function handleCheckAll() {
    checkAll({ projectId: activeProjectId ?? undefined, domain: activeProject?.domain })
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    )
  }

  const stats = data?.stats
  const keywords = data?.keywords ?? []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
            <TrendingUp className="h-6 w-6" style={{ color: "#2563eb" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Suivi de position</h1>
            <p className="text-sm text-slate-500">Positions Google scrappées via Playwright</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCheckAll}
          disabled={isCheckingAll || keywords.length === 0}
          className="gap-1.5"
        >
          {isCheckingAll
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Vérification…</>
            : <><RefreshCw className="h-3.5 w-3.5" />Tout vérifier</>
          }
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Mots-clés suivis", value: stats?.tracked ?? 0, color: "#0f172a" },
          { label: "Position moyenne", value: stats?.avgPosition ?? "—", color: "#2563eb" },
          { label: "Top 10", value: stats?.top10 ?? 0, color: "#10b981" },
          { label: "Top 3", value: stats?.top3 ?? 0, color: "#f59e0b" },
        ].map((s) => (
          <Card key={s.label} className="border-slate-100 rounded-2xl shadow-sm">
            <CardContent className="py-4 px-5 text-center">
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Formulaire ajout */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">Ajouter un mot-clé</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex items-center gap-3">
            <Input
              value={newKw}
              onChange={(e) => setNewKw(e.target.value)}
              placeholder="Ex: audit seo en ligne"
              className="flex-1 border-slate-200"
            />
            <select
              value={device}
              onChange={(e) => setDevice(e.target.value as "desktop" | "mobile")}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
            >
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </select>
            <Button
              type="submit"
              disabled={isAdding || !newKw.trim()}
              className="btn-glow gap-1.5"
              style={{ background: "#2563eb" }}
            >
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ajouter
            </Button>
          </form>
          {!activeProject && (
            <p className="text-xs text-amber-600 mt-2">
              Sélectionnez un projet pour associer le domaine à vérifier automatiquement.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {keywords.length > 0 ? `${keywords.length} mot${keywords.length > 1 ? "s" : ""}-clé${keywords.length > 1 ? "s" : ""}` : "Aucun mot-clé"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-slate-400 hover:text-slate-600">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {keywords.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-500">Aucun mot-clé suivi</p>
              <p className="text-sm mt-1">Ajoutez des mots-clés pour suivre vos positions Google.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Mot-clé</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Position</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Variation</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-600 hidden md:table-cell">URL classée</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Appareil</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Vérifié</th>
                    <th className="py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((kw) => (
                    <tr key={kw.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-2 font-medium text-slate-800">{kw.keyword}</td>
                      <td className="py-2.5 px-2 text-center">
                        <PositionBadge pos={kw.position} />
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <ChangeIndicator change={kw.change} />
                      </td>
                      <td className="py-2.5 px-2 text-slate-500 text-xs font-mono max-w-[200px] truncate hidden md:table-cell">
                        {kw.url ? (
                          <a href={kw.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
                            {kw.url.replace(/^https?:\/\//, "").slice(0, 40)}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Badge variant="secondary" className="text-[10px]">{kw.device}</Badge>
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-slate-400">
                        {kw.checkedAt
                          ? new Date(kw.checkedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                          : <span className="text-amber-500">Jamais</span>
                        }
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-blue-400 hover:text-blue-600"
                            onClick={() => checkOne({ id: kw.id, domain: activeProject?.domain })}
                            disabled={isCheckingOne}
                            title="Vérifier maintenant"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            onClick={() => deleteKeyword(kw.id)}
                            title="Supprimer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info scraping */}
      <p className="text-xs text-slate-400 text-center">
        Le scraping Google utilise Playwright (headless). Cliquez sur &quot;Vérifier&quot; pour lancer une vérification.
        Évitez les vérifications trop fréquentes (risque de captcha).
      </p>
    </div>
  )
}
