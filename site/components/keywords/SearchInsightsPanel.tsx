"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Search, RefreshCw, ExternalLink } from "lucide-react"
import type { SearchInsightMode, SearchQueryInsight } from "@seo/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"
import { useSearchInsights } from "@/hooks/useSearchInsights"

const ContentKeywordsPanel = dynamic(() => import("./ContentKeywordsPanel"), { loading: () => <Skeleton className="h-60 w-full" /> })
const numeric = (value: number | null, decimals = 0) => value === null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: decimals })
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC" })

function QueryCard({ item }: { item: SearchQueryInsight }) {
  return <Card>
    <CardHeader className="space-y-3">
      <CardTitle className="text-base break-words" role="heading" aria-level={2}>{item.query}</CardTitle>
      <div className="flex flex-wrap gap-2"><Badge variant="outline">{item.pageCount} URL(s)</Badge>{item.opportunity && <Badge>CTR à améliorer</Badge>}{item.overlap && <Badge variant="secondary">Chevauchement à vérifier</Badge>}</div>
    </CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm md:grid-cols-4">
        <div><dt className="text-muted-foreground">Impressions des URLs</dt><dd className="font-semibold">{numeric(item.impressions)}</dd></div>
        <div><dt className="text-muted-foreground">Clics</dt><dd className="font-semibold">{numeric(item.clicks)}</dd></div>
        <div><dt className="text-muted-foreground">CTR</dt><dd className="font-semibold">{numeric(item.ctr === null ? null : item.ctr * 100, 2)} %</dd></div>
        <div><dt className="text-muted-foreground">Position moyenne</dt><dd className="font-semibold">{numeric(item.position, 1)}</dd></div>
      </dl>
      {item.opportunity && <div className="rounded-lg border p-3 text-sm space-y-1"><p className="font-medium">CTR médian du projet : {numeric(item.opportunity.referenceCtr * 100, 2)} %</p><p className="text-muted-foreground">{item.opportunity.reason}</p></div>}
      {item.overlap && <p className="text-sm text-muted-foreground">{item.overlap.reason}</p>}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">URLs observées · {item.pages.length} exemple(s)</summary>
        <div className="mt-3 space-y-3">{item.pages.map(page => <div key={page.pageUrl} className="border-t pt-3 text-sm">
          <a href={page.pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 text-primary"><span className="min-w-0 break-all">{page.pageUrl}</span><ExternalLink className="size-3 shrink-0" /></a>
          <p className="text-xs text-muted-foreground mt-1">{numeric(page.impressions)} impressions · {numeric(page.clicks)} clics · CTR {numeric(page.ctr * 100, 2)} % · position {numeric(page.position, 1)}</p>
        </div>)}</div>
      </details>
    </CardContent>
  </Card>
}

function ProjectSearchInsights({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<SearchInsightMode>("all")
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState("")
  const [q, setQuery] = useState("")
  const [showContent, setShowContent] = useState(false)
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useSearchInsights(projectId, { mode, page, q })
  if (isLoading) return <div className="space-y-4">{[0, 1, 2].map(item => <Skeleton key={item} className="h-32 w-full" />)}</div>
  if (error) return <Card><CardContent className="pt-6 space-y-3"><p role="alert" className="text-destructive">{error.message}</p><Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>Réessayer</Button></CardContent></Card>
  if (!data) return null
  return <div className="space-y-6">
    <Card><CardContent className="pt-6 space-y-3">
      {data.snapshot ? <>
        <p className="font-medium break-all">{data.snapshot.propertyUrl}</p>
        <p className="text-sm text-muted-foreground">Du {date(data.snapshot.startDate)} au {date(data.snapshot.endDate)} · import du {new Date(data.snapshot.importedAt).toLocaleString("fr-FR")}</p>
        <p className="text-sm text-muted-foreground">Ces requêtes décrivent la visibilité de votre projet. Les impressions par URL sont additionnées : une même recherche peut exposer plusieurs pages. Les requêtes anonymisées et les lignes non renvoyées par Google sont absentes.</p>
        {data.snapshot.rowLimitReached && <p className="text-sm text-amber-700">La limite de 25 000 lignes requête/page est atteinte. Certains signaux peuvent manquer.</p>}
        {data.snapshot.stale && <p className="text-sm text-amber-700">Cet import a plus de 35 jours. Actualisez Search Console avant de prendre une décision.</p>}
      </> : <p className="text-sm text-muted-foreground">Importez Search Console pour voir les requêtes et les URLs associées.</p>}
      {data.snapshot && !data.snapshot.queriesIncluded && <p className="text-sm text-muted-foreground">Cet import précède le module de requêtes. Un nouvel import est nécessaire.</p>}
      <Link href="/optimization" className="inline-block text-sm text-primary underline">Importer ou actualiser Search Console dans le plan d’action</Link>
    </CardContent></Card>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[
      ["Requêtes observées", data.summary.queryCount], ["Opportunités de CTR", data.summary.opportunityCount], ["Chevauchements à vérifier", data.summary.overlapCount],
    ].map(([label, value]) => <Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{Number(value).toLocaleString("fr-FR")}</p></CardContent></Card>)}</div>
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <form className="flex min-w-0 flex-1 gap-2" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setPage(1) }}>
        <Input aria-label="Rechercher une requête Google" placeholder="Filtrer les requêtes…" maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} />
        <Button type="submit" variant="outline">Rechercher</Button>
      </form>
      <Select value={mode} onValueChange={value => { setMode(value as SearchInsightMode); setPage(1) }}>
        <SelectTrigger className="w-full md:w-64" aria-label="Type de signal"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">Toutes les requêtes</SelectItem><SelectItem value="opportunities">Opportunités de CTR</SelectItem><SelectItem value="overlap">Chevauchements entre URLs</SelectItem></SelectContent>
      </Select>
      <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />Actualiser</Button>
    </div>
    <p className="text-xs text-muted-foreground">Les opportunités comparent le CTR à la médiane du projet pour des positions proches, avec au moins dix requêtes et cent impressions par requête.</p>
    <div aria-busy={isFetching} className={`space-y-4 ${isPlaceholderData ? "opacity-60" : ""}`}>
      {data.items.length ? data.items.map(item => <QueryCard key={item.query} item={item} />) : <Card><CardContent className="py-10 text-center text-muted-foreground">{data.snapshot?.queriesIncluded ? "Aucune requête ne correspond à ces filtres dans les données disponibles." : "Aucune donnée de requête importée pour ce projet."}</CardContent></Card>}
    </div>
    {data.total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{data.total} requête(s) · page {data.page}/{data.pageCount}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={data.page <= 1 || isFetching} onClick={() => setPage(data.page - 1)}>Précédent</Button><Button variant="outline" size="sm" disabled={data.page >= data.pageCount || isFetching} onClick={() => setPage(data.page + 1)}>Suivant</Button></div></div>}
    <div className="border-t pt-4 space-y-4"><Button variant="ghost" onClick={() => setShowContent(value => !value)}>{showContent ? "Masquer" : "Voir"} le vocabulaire extrait des audits</Button>{showContent && <ContentKeywordsPanel key={projectId} />}</div>
  </div>
}

export function SearchInsightsPanel() {
  const { activeProjectId, activeProject, setActiveProjectId } = useActiveProject()
  const { data: projects, isLoading, error } = useProjects()
  return <div className="p-4 md:p-6 space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Search className="size-6 shrink-0 text-primary" />Requêtes Google</h1><p className="text-sm text-muted-foreground mt-1">{activeProject?.name ?? "Choisissez un projet"} · Opportunités et chevauchements issus de Search Console.</p></div>
      <Select value={activeProjectId ?? ""} onValueChange={setActiveProjectId} disabled={isLoading}><SelectTrigger className="w-full md:w-72" aria-label="Projet des requêtes"><SelectValue placeholder="Sélectionner un projet" /></SelectTrigger><SelectContent>{projects?.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select>
    </div>
    {error && <p role="alert" className="text-destructive">{error.message}</p>}
    {activeProjectId ? <ProjectSearchInsights key={activeProjectId} projectId={activeProjectId} /> : <Card><CardContent className="py-10 text-center text-muted-foreground">Sélectionnez un projet pour afficher ses requêtes.{projects?.length === 0 && <p className="mt-2"><Link href="/projects" className="underline">Créer un projet</Link></p>}</CardContent></Card>}
  </div>
}
