"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Link2, ExternalLink, Download, Plus, Trash2, Loader2, Search } from "lucide-react"
import { useBacklinks, useFetchBacklinks, useAddBacklink, useDeleteBacklink } from "@/hooks/useBacklinks"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"

function DRBadge({ dr }: { dr: number | null }) {
  if (dr === null) return <Badge variant="secondary" className="text-xs">—</Badge>
  const color = dr >= 70 ? "#10b981" : dr >= 40 ? "#f59e0b" : "#94a3b8"
  return <Badge style={{ background: `${color}18`, color }} className="text-xs">{dr}</Badge>
}

export default function BacklinksPage() {
  const { activeProjectId } = useActiveProject()
  const { data: projects } = useProjects()
  const [domainFilter, setDomainFilter] = useState("")
  const [page, setPage] = useState(1)
  const [showAddForm, setShowAddForm] = useState(false)
  const [fetchDomain, setFetchDomain] = useState("")
  const [newBl, setNewBl] = useState({ sourceUrl: "", targetUrl: "/", anchor: "", dofollow: true })

  const { data, isLoading, refetch } = useBacklinks({
    projectId: activeProjectId,
    domain: domainFilter || undefined,
    page,
  })
  const { mutate: fetchBacklinks, isPending: isFetching } = useFetchBacklinks()
  const { mutate: addBacklink, isPending: isAdding } = useAddBacklink()
  const { mutate: deleteBacklink } = useDeleteBacklink()

  const activeProject = projects?.find((p) => p.id === activeProjectId)

  function handleFetch(e: React.FormEvent) {
    e.preventDefault()
    const domain = fetchDomain || activeProject?.domain || ""
    if (!domain) return
    fetchBacklinks(
      { domain, projectId: activeProjectId ?? undefined },
      { onSuccess: () => setTimeout(() => refetch(), 15_000) }
    )
  }

  function handleAddBacklink(e: React.FormEvent) {
    e.preventDefault()
    addBacklink(
      { ...newBl, projectId: activeProjectId ?? undefined },
      { onSuccess: () => { setShowAddForm(false); setNewBl({ sourceUrl: "", targetUrl: "/", anchor: "", dofollow: true }) } }
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    )
  }

  const stats = data?.stats
  const items = data?.items ?? []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
            <Link2 className="h-6 w-6" style={{ color: "#2563eb" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Backlinks</h1>
            <p className="text-sm text-slate-500">Profil de liens via OpenLinkProfiler</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total backlinks", value: stats?.total ?? 0, color: "#0f172a" },
          { label: "Domaines référents", value: stats?.uniqueDomains ?? 0, color: "#2563eb" },
          { label: "Dofollow", value: stats?.dofollow ?? 0, color: "#10b981" },
          { label: "DR moyen", value: stats?.avgDomainRating ?? "—", color: "#f59e0b" },
        ].map((s) => (
          <Card key={s.label} className="border-slate-100 rounded-2xl shadow-sm">
            <CardContent className="py-4 px-5 text-center">
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Import OpenLinkProfiler */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Download className="h-4 w-4 text-slate-400" />
            Importer depuis OpenLinkProfiler (gratuit)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFetch} className="flex gap-3">
            <Input
              value={fetchDomain}
              onChange={(e) => setFetchDomain(e.target.value)}
              placeholder={activeProject?.domain ?? "exemple.com"}
              className="flex-1 border-slate-200"
            />
            <Button type="submit" disabled={isFetching} className="btn-glow gap-1.5" style={{ background: "#2563eb" }}>
              {isFetching ? <><Loader2 className="h-4 w-4 animate-spin" />Import…</> : <><Download className="h-4 w-4" />Importer</>}
            </Button>
          </form>
          <p className="text-xs text-slate-400 mt-2">
            Laissez vide pour utiliser le domaine du projet actif. Les résultats apparaissent en ~15s.
          </p>
        </CardContent>
      </Card>

      {/* Formulaire ajout manuel */}
      {showAddForm && (
        <Card className="border-blue-100 rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">Ajouter un backlink manuellement</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddBacklink} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={newBl.sourceUrl}
                  onChange={(e) => setNewBl({ ...newBl, sourceUrl: e.target.value })}
                  placeholder="https://source.com/article"
                  required
                  className="border-slate-200"
                />
                <Input
                  value={newBl.targetUrl}
                  onChange={(e) => setNewBl({ ...newBl, targetUrl: e.target.value })}
                  placeholder="/page-cible"
                  className="border-slate-200"
                />
                <Input
                  value={newBl.anchor}
                  onChange={(e) => setNewBl({ ...newBl, anchor: e.target.value })}
                  placeholder="Texte ancre"
                  className="border-slate-200"
                />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newBl.dofollow}
                      onChange={(e) => setNewBl({ ...newBl, dofollow: e.target.checked })}
                      className="rounded"
                    />
                    Dofollow
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isAdding} className="btn-glow gap-1.5" style={{ background: "#2563eb" }}>
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ajouter
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>Annuler</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filtre + tableau */}
      <Card className="border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base flex-1">{stats?.total ?? 0} backlink{(stats?.total ?? 0) > 1 ? "s" : ""}</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={domainFilter}
                onChange={(e) => { setDomainFilter(e.target.value); setPage(1) }}
                placeholder="Filtrer par domaine…"
                className="pl-8 border-slate-200 h-8 text-sm w-48"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Link2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-500">Aucun backlink</p>
              <p className="text-sm mt-1">Importez vos backlinks ou ajoutez-en manuellement.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Source</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600 hidden md:table-cell">Page cible</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600 hidden md:table-cell">Ancre</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">DR</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Type</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600 hidden sm:table-cell">Vu le</th>
                      <th className="py-3 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((bl) => (
                      <tr key={bl.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 px-2">
                          <a
                            href={bl.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 font-mono flex items-center gap-1 hover:underline max-w-[200px]"
                          >
                            <span className="truncate">{bl.sourceDomain}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </td>
                        <td className="py-2.5 px-2 text-xs text-slate-600 font-mono hidden md:table-cell">
                          <span className="truncate max-w-[120px] block">{bl.targetUrl}</span>
                        </td>
                        <td className="py-2.5 px-2 text-xs text-slate-700 hidden md:table-cell">
                          <span className="truncate max-w-[120px] block">{bl.anchor || "—"}</span>
                        </td>
                        <td className="py-2.5 px-2 text-center"><DRBadge dr={bl.domainRating} /></td>
                        <td className="py-2.5 px-2 text-center">
                          <Badge
                            className="text-[10px]"
                            style={{
                              background: bl.dofollow ? "#10b98115" : "#64748b15",
                              color: bl.dofollow ? "#10b981" : "#64748b",
                            }}
                          >
                            {bl.dofollow ? "dofollow" : "nofollow"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-center text-xs text-slate-400 hidden sm:table-cell">
                          {new Date(bl.firstSeen).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </td>
                        <td className="py-2.5 px-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            onClick={() => deleteBacklink(bl.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(data?.totalPages ?? 1) > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                    Précédent
                  </Button>
                  <span className="text-sm text-slate-500">Page {page} / {data?.totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= (data?.totalPages ?? 1)}>
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
