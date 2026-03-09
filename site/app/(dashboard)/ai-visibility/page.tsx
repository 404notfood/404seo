"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Eye, Plus, Trash2, Loader2, Sparkles, X } from "lucide-react"
import { useAIVisibility, useCheckAIVisibility, useDeleteAICheck } from "@/hooks/useAIVisibility"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"

const SUGGESTED_QUERIES = [
  "Quel est le meilleur outil d'audit SEO ?",
  "Comment améliorer le référencement d'un site web ?",
  "Quels outils SEO recommandez-vous ?",
  "Comment faire un audit SEO complet ?",
  "Meilleure plateforme d'analyse SEO",
  "Outils SEO professionnels pour agences",
  "Comment vérifier le score SEO d'un site ?",
  "Alternatives à SEMrush et Ahrefs",
]

export default function AIVisibilityPage() {
  const { activeProjectId } = useActiveProject()
  const { data: projects } = useProjects()
  const { data, isLoading, refetch } = useAIVisibility()
  const { mutate: checkVisibility, isPending: isChecking } = useCheckAIVisibility()
  const { mutate: deleteCheck } = useDeleteAICheck()

  const [domain, setDomain] = useState("")
  const [queries, setQueries] = useState<string[]>([])
  const [customQuery, setCustomQuery] = useState("")

  const activeProject = projects?.find((p) => p.id === activeProjectId)

  function toggleQuery(q: string) {
    setQueries((prev) => prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q])
  }

  function addCustomQuery() {
    if (!customQuery.trim() || queries.includes(customQuery.trim())) return
    setQueries((prev) => [...prev, customQuery.trim()])
    setCustomQuery("")
  }

  function handleCheck(e: React.FormEvent) {
    e.preventDefault()
    const targetDomain = domain.trim() || activeProject?.domain || ""
    if (!targetDomain || queries.length === 0) return
    checkVisibility(
      { domain: targetDomain, queries, engine: "claude" },
      { onSuccess: () => setTimeout(() => refetch(), 15_000) }
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    )
  }

  const stats = data?.stats
  const checks = data?.checks ?? []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
          <Eye className="h-6 w-6" style={{ color: "#06b6d4" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Visibilité IA</h1>
          <p className="text-sm text-slate-500">Détectez si votre site est mentionné par les IA génératives</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Requêtes testées", value: stats?.total ?? 0, color: "#0f172a" },
          { label: "Taux de mention", value: stats?.mentionRate != null ? `${stats.mentionRate}%` : "—", color: "#06b6d4" },
          { label: "Mentions", value: stats?.mentioned ?? 0, color: "#10b981" },
          { label: "Position moy.", value: stats?.avgPosition ?? "—", color: "#2563eb" },
        ].map((s) => (
          <Card key={s.label} className="border-slate-100 rounded-2xl shadow-sm">
            <CardContent className="py-4 px-5 text-center">
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Formulaire de check */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-500" />
            Tester la visibilité d&apos;un domaine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCheck} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1.5 block">Domaine à tester</label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder={activeProject?.domain ?? "monsite.fr"}
                className="border-slate-200"
              />
            </div>

            {/* Requêtes suggérées */}
            <div>
              <label className="text-xs font-medium text-slate-600 mb-2 block">
                Requêtes à tester ({queries.length} sélectionnées)
              </label>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => toggleQuery(q)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      queries.includes(q)
                        ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {queries.includes(q) ? "✓ " : ""}{q.slice(0, 50)}{q.length > 50 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Requête personnalisée */}
            <div className="flex gap-2">
              <Input
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Ajouter une requête personnalisée…"
                className="flex-1 border-slate-200 text-sm"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomQuery() } }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomQuery} disabled={!customQuery.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Requêtes sélectionnées */}
            {queries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {queries.map((q) => (
                  <span key={q} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                    {q.slice(0, 40)}{q.length > 40 ? "…" : ""}
                    <button type="button" onClick={() => toggleQuery(q)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <Button
              type="submit"
              disabled={isChecking || queries.length === 0 || (!domain.trim() && !activeProject?.domain)}
              className="btn-glow gap-1.5"
              style={{ background: "#06b6d4" }}
            >
              {isChecking
                ? <><Loader2 className="h-4 w-4 animate-spin" />Vérification…</>
                : <><Sparkles className="h-4 w-4" />Lancer la vérification ({queries.length} requête{queries.length > 1 ? "s" : ""})</>
              }
            </Button>

            {!process.env.NEXT_PUBLIC_HAS_ANTHROPIC && (
              <p className="text-xs text-amber-600">
                Requiert <code>ANTHROPIC_API_KEY</code> dans <code>apps/api/.env</code>
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Résultats */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{checks.length} résultat{checks.length > 1 ? "s" : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {checks.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Eye className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-500">Aucune vérification lancée</p>
              <p className="text-sm mt-1">Configurez un domaine et des requêtes pour tester votre visibilité IA.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">Requête</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Mentionné</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Position</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Moteur</th>
                    <th className="text-left py-3 px-2 font-semibold text-slate-600 hidden md:table-cell">Extrait</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600 hidden sm:table-cell">Date</th>
                    <th className="py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-2 text-slate-800 max-w-[200px]">
                        <span className="truncate block text-xs">{c.query}</span>
                        <span className="text-[10px] text-slate-400">{c.domain}</span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Badge
                          className="text-[10px]"
                          style={{
                            background: c.mentioned ? "#10b98115" : "#ef444415",
                            color: c.mentioned ? "#10b981" : "#ef4444",
                          }}
                        >
                          {c.mentioned ? "Oui" : "Non"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {c.position ? (
                          <span className="font-mono font-bold text-cyan-600">{c.position}</span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <Badge variant="secondary" className="text-xs capitalize">{c.engine}</Badge>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-slate-500 hidden md:table-cell max-w-[200px]">
                        {c.snippet ? (
                          <span className="truncate block italic">{c.snippet.slice(0, 80)}…</span>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-slate-400 hidden sm:table-cell">
                        {new Date(c.checkedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </td>
                      <td className="py-2.5 px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                          onClick={() => deleteCheck(c.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
