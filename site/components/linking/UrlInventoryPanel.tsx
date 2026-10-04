"use client"

import { useState } from "react"
import Link from "next/link"
import { Download, RefreshCw } from "lucide-react"
import { serializeCsv } from "@seo/shared"
import type { UrlInventoryMode, UrlInventoryState, UrlInventoryItem, SitemapDocumentStatus } from "@seo/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSyncSitemaps, useUrlInventory } from "@/hooks/useUrlInventory"

const STATE_LABELS: Record<UrlInventoryState, string> = { NO_AUDIT: "Audit à lancer", NOT_CRAWLED: "Absente du crawl, aucun entrant observé", LINKED_NOT_CRAWLED: "Liée mais non auditée", NO_INCOMING: "Auditée sans entrant observé", LINKED: "Lien observé ou URL de départ", EXCLUDED: "Exclue des candidates", UNASSESSED: "Auditée, hors périmètre du graphe" }
const NEXT_STEPS: Record<UrlInventoryState, string> = {
  NO_AUDIT: "Lancez un audit pour comparer cet inventaire aux liens du site.",
  NOT_CRAWLED: "Vérifiez que la page existe encore et doit être indexable. Contrôlez les limites du crawl et sa date avant de chercher un lien à ajouter.",
  LINKED_NOT_CRAWLED: "Un lien existe dans le périmètre observé. Examinez le budget de pages, la profondeur, les règles robots et l’accessibilité de la destination.",
  NO_INCOMING: "Cette page est indexable selon l’audit, sans lien entrant dans le graphe observé. Cherchez une source pertinente et confirmez sur le site avant de modifier le maillage.",
  LINKED: "Cette URL ne présente pas d’absence de lien dans le périmètre étudié.",
  EXCLUDED: "Vérifiez si l’exclusion est intentionnelle et si cette URL doit encore figurer dans les sources d’inventaire.",
  UNASSESSED: "Cette URL figure dans l’audit complet, mais ses entrants ne sont pas suffisamment évalués dans le graphe limité.",
}
const DOCUMENT_LABELS: Record<SitemapDocumentStatus, string> = {
  OK: "Lu", HTTP_ERROR: "Réponse HTTP en erreur", FETCH_ERROR: "Fichier inaccessible",
  INVALID_XML: "Format XML invalide ou incompatible", TOO_LARGE: "Limite de taille dépassée", REDIRECT_BLOCKED: "Redirection refusée",
}
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR", /^\d{4}-\d{2}-\d{2}$/u.test(value) ? { timeZone: "UTC" } : undefined)

function exportRows(items: UrlInventoryItem[]) {
  const csv = serializeCsv([["URL", "État observé", "Sources entrantes observées", "Sitemaps", "Dans Search Console", "Clics GSC", "Impressions GSC"],
    ...items.map(item => [item.url, STATE_LABELS[item.state], item.incoming === null ? "Inconnu" : String(item.incoming), item.sitemapUrls.join(" | "), item.inSearchConsole ? "Oui" : "Non", item.search ? String(item.search.clicks) : "Inconnu", item.search ? String(item.search.impressions) : "Inconnu"])])
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "inventaire-urls-page.csv"; anchor.click(); URL.revokeObjectURL(url)
}

export default function UrlInventoryPanel({ projectId, canEdit, hasAudit }: { projectId: string; canEdit: boolean; hasAudit: boolean }) {
  const [mode, setMode] = useState<UrlInventoryMode>(hasAudit ? "investigate" : "all")
  const [draft, setDraft] = useState(""), [q, setQuery] = useState(""), [page, setPage] = useState(1), [sitemapUrl, setSitemapUrl] = useState("")
  const { data, isLoading, isFetching, error, refetch } = useUrlInventory(projectId, { mode, q, page })
  const sync = useSyncSitemaps(projectId)
  return <Card aria-label="Inventaire des URLs"><CardHeader><CardTitle><h2 className="text-lg">Inventaire des URLs · sitemap et Search Console</h2></CardTitle></CardHeader><CardContent className="space-y-5">
    <p className="text-sm text-muted-foreground">Rapprochez les URLs déclarées dans les sitemaps ou présentes dans l’import GSC avec le dernier audit terminé. Une candidate reste une piste à vérifier : ce rapprochement ne prouve pas qu’une page est orpheline sur tout le site.</p>
    <form className="flex flex-col gap-2 md:flex-row" onSubmit={event => { event.preventDefault(); sync.mutate(sitemapUrl.trim() || undefined) }}><Input type="url" maxLength={2048} aria-label="URL du sitemap" placeholder="URL sitemap facultative · sinon découverte via robots.txt" value={sitemapUrl} disabled={!canEdit || sync.isPending} onChange={event => setSitemapUrl(event.target.value)} /><Button type="submit" disabled={!canEdit || sync.isPending}>{sync.isPending ? "Import des sitemaps…" : "Importer les sitemaps"}</Button></form>
    <p className="text-xs text-muted-foreground">Fichiers XML et XML gzip, sur le même domaine, protocole et port que le projet. Les index sont suivis dans les limites de l’import. Sans URL, lecture de robots.txt puis essai de /sitemap.xml. Aucun crawl des pages de l’inventaire n’est lancé automatiquement.</p>
    {sync.error && <p role="alert" className="text-sm text-destructive">{sync.error.message}</p>}
    {isLoading && <Skeleton className="h-40 w-full" />}
    {error && <div className="space-y-2"><p role="alert" className="text-destructive">{error.message}</p><Button variant="outline" onClick={() => void refetch()}>Réessayer l’inventaire</Button></div>}
    {data && <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["URLs inventoriées", data.summary.inventoried], ["À investiguer", data.summary.investigate], ["Sans entrant, auditées", data.summary.withoutIncoming], ["Liées mais non auditées", data.summary.linkedNotCrawled]].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}</dl>
      <div className="rounded-lg bg-muted p-3 space-y-2 text-sm">
        <p>{data.audit ? <>Audit du {data.audit.completedAt ? date(data.audit.completedAt) : "—"} · {data.audit.pageCount} page(s), {data.audit.analyzedPages} dans le graphe · <Link href={`/audits/${data.audit.id}`} className="underline">Voir l’audit</Link></> : "Aucun audit terminé : les URLs sont inventoriées sans diagnostic de maillage."}</p>
        <p>{data.sitemap ? `${data.sitemap.pageCount} URL(s) de sitemaps · import du ${date(data.sitemap.importedAt)}` : "Aucun inventaire de sitemaps exploitable enregistré."}</p>
        <p>{data.searchConsole ? <>Search Console · <span className="break-all">{data.searchConsole.propertyUrl}</span> · {date(data.searchConsole.startDate)} au {date(data.searchConsole.endDate)} · import du {date(data.searchConsole.importedAt)}</> : <>Aucun import GSC disponible. <Link href="/optimization" className="underline">Connecter et importer Search Console</Link></>}</p>
        {(data.sitemap?.stale || data.searchConsole?.stale) && <p className="text-amber-700">Une source a plus de 35 jours. Actualisez-la avant de décider ; la GSC ancienne ne pondère pas l’ordre des candidates.</p>}
        {(data.coverage.graphPartial || data.coverage.inventoryLimited || data.searchConsole?.limited || data.sitemap && (Object.values(data.sitemap.data.limits).some(Boolean) || data.sitemap.data.documents.some(doc => doc.status !== "OK") || data.sitemap.data.omittedUrls > 0)) && <p>Couverture partielle : limites de collecte, URLs filtrées ou sources indisponibles. Les absences et les comptes concernent uniquement le périmètre traité.</p>}
        {data.sitemap && <details><summary className="cursor-pointer">Preuves de l’import sitemap · {data.sitemap.data.documents.length} fichier(s)</summary><div className="mt-2 space-y-2">{data.sitemap.data.documents.map((doc, index) => <div key={`${doc.url}-${index}`}><a className="break-all underline text-xs" href={doc.url} target="_blank" rel="noopener noreferrer">{doc.url}</a><p className="text-xs">{doc.status === "OK" ? `${doc.kind === "INDEX" ? "Index" : "Sitemap de pages"} lu · ${doc.urlCount} URL(s) retenue(s)` : `Non exploitable : ${DOCUMENT_LABELS[doc.status]}${doc.httpStatus ? ` · HTTP ${doc.httpStatus}` : ""}`}</p></div>)}<p className="text-xs">{data.sitemap.data.omittedUrls} URL(s) ignorée(s). Les erreurs et bornes peuvent masquer d’autres URLs.</p></div></details>}
      </div>
      <div className="flex flex-col gap-2 lg:flex-row"><Select value={mode} onValueChange={value => { setMode(value as UrlInventoryMode); setPage(1) }}><SelectTrigger aria-label="État des URLs de l’inventaire" className="w-full lg:w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="investigate">À investiguer</SelectItem><SelectItem value="all">Tout l’inventaire</SelectItem><SelectItem value="not-crawled">Non auditées</SelectItem><SelectItem value="without-incoming">Sans entrant observé</SelectItem><SelectItem value="linked-not-crawled">Liées mais non auditées</SelectItem><SelectItem value="excluded">Exclues</SelectItem></SelectContent></Select>
        <form className="flex flex-1 gap-2" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setPage(1) }}><Input aria-label="Filtrer les URLs de l’inventaire" placeholder="URL ou titre…" maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} /><Button type="submit" variant="outline">Filtrer l’inventaire</Button></form></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">D’abord les pages auditées sans entrant, puis les URLs absentes du crawl. Au sein d’un état, les impressions GSC récentes servent à ordonner les résultats.</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className="size-4" />Actualiser l’inventaire</Button><Button size="sm" variant="outline" disabled={!data.items.length || isFetching} onClick={() => exportRows(data.items)}><Download className="size-4" />Exporter les URLs affichées</Button></div></div>
      {data.items.map(item => <div key={item.url} className="rounded-lg border p-4 space-y-3 text-sm"><h3 className="font-semibold">{STATE_LABELS[item.state]}</h3><a className="block break-all underline text-primary" href={item.url} target="_blank" rel="noopener noreferrer">{item.title && <span className="block font-medium">{item.title}</span>}{item.url}</a>
        <div className="flex flex-wrap gap-3 text-xs"><span>Sources entrantes observées : {item.incoming ?? "inconnu"}</span><span>{item.sitemapUrls.length ? "Sitemap" : "Sans preuve sitemap"}</span><span>{item.inSearchConsole ? "Import GSC" : "Sans preuve GSC"}</span></div>
        {item.search && <p className="text-xs text-muted-foreground">{item.search.clicks.toLocaleString("fr-FR")} clic(s) · {item.search.impressions.toLocaleString("fr-FR")} impression(s) dans la période GSC{data.searchConsole?.stale ? " ancienne" : ""}. Cela ne confirme pas l’indexation actuelle.</p>}
        {item.exclusion && <p className="text-xs text-muted-foreground">{item.exclusion}</p>}<p className="text-muted-foreground">{NEXT_STEPS[item.state]}</p>
        {item.sitemapUrls.length > 0 && <details><summary className="cursor-pointer text-xs">Sitemaps contenant cette URL</summary>{item.sitemapUrls.map(url => <a key={url} className="block break-all underline text-xs mt-2" href={url} target="_blank" rel="noopener noreferrer">{url}</a>)}</details>}
      </div>)}
      {!data.items.length && <p className="py-4 text-center text-sm text-muted-foreground">{data.summary.inventoried ? "Aucun résultat avec ces filtres. Cela ne prouve pas l’absence de pages orphelines." : "Importez un sitemap ou les données Search Console pour constituer l’inventaire."}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p>{data.total} URL(s) · {data.page}/{data.pageCount}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={isFetching || data.page <= 1} onClick={() => setPage(data.page - 1)}>URLs précédentes</Button><Button size="sm" variant="outline" disabled={isFetching || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>URLs suivantes</Button></div></div>
    </>}
  </CardContent></Card>
}
