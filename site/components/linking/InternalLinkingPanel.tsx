"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Link2, Copy, Download, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { InternalLinkSuggestion, InternalLinkView } from "@seo/shared"
import { serializeCsv } from "@seo/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"
import { useRole } from "@/hooks/useMe"
import { useLaunchAudit } from "@/hooks/useAudits"
import { useInternalLinks } from "@/hooks/useInternalLinks"

const UrlInventoryPanel = dynamic(() => import("./UrlInventoryPanel"), { loading: () => <Skeleton className="h-40 w-full" /> })

function PageLink({ url, title }: { url: string; title?: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" className="block break-all text-primary underline">{title && <span className="block font-medium">{title}</span>}<span className="text-xs">{url}</span></a>
}

function exportSuggestions(rows: InternalLinkSuggestion[]) {
  // Spreadsheet applications can execute formula cells, including in CSV downloads.
  const csv = serializeCsv([["URL source", "URL destination", "Ancre proposée", "Passage source", "Liens entrants observés"], ...rows.map(row => [row.sourceUrl, row.targetUrl, row.anchor, row.excerpt, String(row.targetIncoming)])])
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "maillage-suggestions-page.csv"; anchor.click(); URL.revokeObjectURL(url)
}

function Suggestion({ item }: { item: InternalLinkSuggestion }) {
  const start = item.excerpt.indexOf(item.anchor)
  return <Card><CardContent className="pt-5 space-y-4 text-sm">
    <div className="grid gap-4 md:grid-cols-2"><div><p className="mb-1 text-xs text-muted-foreground">Ajouter un lien depuis</p><PageLink url={item.sourceUrl} title={item.sourceTitle} /></div><div><p className="mb-1 text-xs text-muted-foreground">Vers · {item.targetIncoming} page(s) source(s) observée(s)</p><PageLink url={item.targetUrl} title={item.targetTitle} /></div></div>
    <div className="flex flex-wrap items-center gap-2"><p>Ancre proposée : <strong>{item.anchor}</strong></p><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(item.anchor).then(() => toast.success("Ancre copiée"), () => toast.error("Impossible de copier l’ancre"))}><Copy className="size-3" />Copier l’ancre</Button></div>
    <blockquote className="border-l-2 border-primary pl-3 text-muted-foreground break-words">{start < 0 ? item.excerpt : <>{item.excerpt.slice(0, start)}<mark className="bg-primary/15 text-foreground">{item.anchor}</mark>{item.excerpt.slice(start + item.anchor.length)}</>}</blockquote>
    <p className="text-xs text-muted-foreground">Termes communs au titre ou H1 de la destination : {item.matchedTerms.join(", ")}. Aucun lien vers cette URL n’a été observé dans la source. Validez la pertinence dans votre éditeur avant de l’ajouter.</p>
  </CardContent></Card>
}

function ProjectLinking({ projectId }: { projectId: string }) {
  const [view, setView] = useState<InternalLinkView>("suggestions")
  const [draft, setDraft] = useState("")
  const [q, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [unlinked, setUnlinked] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  const { data, isLoading, isFetching, error, refetch } = useInternalLinks(projectId, { view, q, page, unlinked })
  const { isMember } = useRole()
  const router = useRouter()
  const launch = useLaunchAudit({ onAuditCreated: id => router.push(`/audits/${id}`) })
  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (error) return <Card><CardContent className="pt-6 space-y-3"><p role="alert">{error.message}</p><Button variant="outline" onClick={() => void refetch()}>Réessayer</Button></CardContent></Card>
  if (!data) return null
  return <div className="space-y-5">
    <div><Button variant="outline" aria-expanded={showInventory} onClick={() => setShowInventory(value => !value)}>{showInventory ? "Masquer" : "Ouvrir"} l’inventaire sitemap et GSC</Button></div>
    {showInventory && <UrlInventoryPanel key={data.audit?.id ?? "no-audit"} projectId={projectId} canEdit={isMember} hasAudit={!!data.audit} />}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{data.audit ? <>{data.audit.pageCount} page(s) dans l’audit {data.audit.completedAt ? `du ${new Date(data.audit.completedAt).toLocaleDateString("fr-FR")}` : ""} · <Link className="underline" href={`/audits/${data.audit.id}/links`}>Voir les liens de l’audit</Link></> : "Aucun audit terminé pour ce projet."}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className="size-4" />Actualiser</Button><Button size="sm" disabled={!isMember || launch.isPending} onClick={() => launch.mutate({ projectId })}>{launch.isPending ? "Lancement…" : "Relancer un audit"}</Button></div></div>
    {data.audit && <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Pages analysées", data.summary.pages], ["Liens distincts", data.summary.edges], ["Sans entrant observé", data.summary.withoutIncoming], ["Destinations non auditées", data.summary.unknownTargets]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}</dl>
      <Card><CardContent className="pt-4 space-y-2 text-sm text-muted-foreground"><p>Ce graphe décrit les pages et liens observés dans cet audit, y compris la navigation et les liens nofollow. Une page sans entrant observé n’est pas nécessairement orpheline sur tout le site. La profondeur est la distance depuis l’URL de départ, dans ce graphe.</p>
        {data.summary.contextualPages < data.summary.pages && <p className="text-amber-700">{data.summary.pages - data.summary.contextualPages} page(s) sans données d’ancres et de paragraphes. Relancez l’audit pour obtenir les suggestions contextualisées.</p>}
        {(data.limits.pages || data.limits.links || data.limits.content || data.limits.suggestions) && <p>Couverture limitée : {[[data.limits.pages, "pages partiellement analysées"], [data.limits.links, "liens partiellement collectés"], [data.limits.content, "paragraphes partiellement collectés"], [data.limits.suggestions, "suggestions plafonnées"]].filter(([active]) => active).map(([, label]) => label).join(" · ")}. L’absence d’un lien n’est pas une preuve exhaustive.</p>}
      </CardContent></Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Select value={view} onValueChange={value => { setView(value as InternalLinkView); setPage(1) }}><SelectTrigger className="w-full lg:w-60" aria-label="Vue du maillage"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="suggestions">Suggestions de liens</SelectItem><SelectItem value="pages">Pages et profondeur</SelectItem><SelectItem value="anchors">Ancres à examiner</SelectItem></SelectContent></Select>
        <form className="flex flex-1 gap-2" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setPage(1) }}><Input aria-label="Filtrer le maillage" placeholder="URL, titre ou ancre…" value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} /><Button type="submit" variant="outline">Filtrer</Button></form>
        {view === "pages" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unlinked} onChange={event => { setUnlinked(event.target.checked); setPage(1) }} />Sans lien entrant</label>}
      </div>
      {view === "suggestions" && <><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Jusqu’à 3 propositions par source, classées par nombre d’entrants de la destination, puis termes communs. Les textes proposés existent dans la page source. Les pages non indexables, redirigées ou à canonique différente sont exclues.</p><Button size="sm" variant="outline" disabled={!data.suggestions.length || isFetching} onClick={() => exportSuggestions(data.suggestions)}><Download className="size-4" />Exporter cette page</Button></div>{data.suggestions.map(item => <Suggestion key={`${item.sourceUrl}\0${item.targetUrl}`} item={item} />)}</>}
      {view === "pages" && data.nodes.map(node => <Card key={node.url}><CardContent className="pt-4 space-y-3 text-sm"><PageLink url={node.url} title={node.title} /><dl className="grid grid-cols-3 gap-2"><div><dt className="text-xs text-muted-foreground">Sources entrantes</dt><dd>{node.incoming}</dd></div><div><dt className="text-xs text-muted-foreground">Destinations sortantes</dt><dd>{node.outgoing}</dd></div><div><dt className="text-xs text-muted-foreground">Profondeur observée</dt><dd>{node.depth ?? "Non atteinte"}</dd></div></dl>{node.exclusion && <p className="text-xs text-muted-foreground">Exclue des suggestions : {node.exclusion}</p>}</CardContent></Card>)}
      {view === "anchors" && <><p className="text-xs text-muted-foreground">{data.summary.anchorIssues} occurrence(s) à examiner · 500 exemples maximum. Un nofollow peut être intentionnel : vérifiez son usage avant de le modifier.</p>{data.anchorIssues.map((item, index) => <Card key={`${item.sourceUrl}-${index}`}><CardHeader><CardTitle className="text-sm" role="heading" aria-level={2}>{item.reason === "NOFOLLOW" ? "Lien nofollow" : item.reason === "EMPTY" ? "Ancre vide" : "Ancre générique"}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><PageLink url={item.sourceUrl} /><p>Vers</p><PageLink url={item.targetUrl} /><p>Ancre observée : {item.anchor || "(vide)"}</p></CardContent></Card>)}</>}
      {data.total === 0 && <Card><CardContent className="py-8 text-center text-muted-foreground">{view === "suggestions" ? "Aucune suggestion avec les preuves et les filtres actuels. Cela ne confirme pas que le maillage est optimal." : "Aucun résultat avec ces filtres."}</CardContent></Card>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{data.total} résultat(s) · {data.page}/{data.pageCount}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={isFetching || data.page <= 1} onClick={() => setPage(data.page - 1)}>Précédent</Button><Button variant="outline" size="sm" disabled={isFetching || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Suivant</Button></div></div>
    </>}
  </div>
}

export function InternalLinkingPanel() {
  const { activeProjectId, activeProject, setActiveProjectId } = useActiveProject()
  const { data: projects, isLoading, error } = useProjects()
  return <div className="p-4 md:p-6 space-y-6"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Link2 className="size-6 text-primary" />Maillage interne</h1><p className="mt-1 text-sm text-muted-foreground">{activeProject?.name ?? "Choisissez un projet"} · Des suggestions appuyées par le contenu audité.</p></div><Select value={activeProjectId ?? ""} onValueChange={setActiveProjectId} disabled={isLoading}><SelectTrigger className="w-full md:w-72" aria-label="Projet du maillage"><SelectValue placeholder="Sélectionner un projet" /></SelectTrigger><SelectContent>{projects?.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
    {error && <p role="alert" className="text-destructive">{error.message}</p>}{activeProjectId ? <ProjectLinking key={activeProjectId} projectId={activeProjectId} /> : <Card><CardContent className="py-10 text-center text-muted-foreground">Sélectionnez un projet pour analyser son maillage.{projects?.length === 0 && <p className="mt-2"><Link href="/projects" className="underline">Créer votre premier projet</Link></p>}</CardContent></Card>}
  </div>
}
