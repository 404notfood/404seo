"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, ExternalLink, ListChecks, RefreshCw, Search } from "lucide-react"
import type { ActionPlan, SeoActionItem, SeoActionStatus, ProjectAnalytics } from "@seo/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActiveProject } from "@/contexts/ProjectContext"
import { useProjects } from "@/hooks/useProjects"
import { useRole } from "@/hooks/useMe"
import { useGoogleStatus } from "@/hooks/useGoogle"
import { useLaunchAudit } from "@/hooks/useAudits"
import { useActionPlan, useSearchConsoleProperties, useSyncSearchConsole, useUpdateSeoAction, useVerifySeoActions } from "@/hooks/useActionPlan"
import { apiClient } from "@/lib/api-client"
import { ActionOutcome } from "./ActionOutcome"
import { AnalyticsPanel } from "./AnalyticsPanel"
import { AnalyticsOutcome } from "./AnalyticsOutcome"
import { useProjectAnalytics } from "@/hooks/useAnalytics"

const STATUS_LABELS: Record<SeoActionStatus, string> = { OPEN: "À faire", IN_PROGRESS: "En cours", IMPLEMENTED: "Correction effectuée", VERIFIED: "Vérifiée par audit", DISMISSED: "Écartée" }
const EFFORT_LABELS = { LOW: "Faible", MEDIUM: "Moyen", HIGH: "Élevé" }
const PRIORITY_LABELS = { LOW: "Basse", MEDIUM: "Moyenne", HIGH: "Haute" }
const CONFIDENCE_LABELS = { AUDIT_ONLY: "Audit seul", PARTIAL_GSC: "GSC partielle", GSC_MATCHED: "GSC correspondante" }
const number = (value: number) => Math.round(value).toLocaleString("fr-FR")
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR", /^\d{4}-\d{2}-\d{2}$/.test(value) ? { timeZone: "UTC" } : undefined)

function SearchConsolePanel({ projectId, snapshot, canEdit }: { projectId: string; snapshot: ActionPlan["searchConsole"]; canEdit: boolean }) {
  const { data: googleStatus, isLoading: accountsLoading, error: accountsError } = useGoogleStatus()
  const accounts = (googleStatus?.accounts ?? []).filter(account => account.scopes.some(scope => scope === "https://www.googleapis.com/auth/webmasters.readonly" || scope === "https://www.googleapis.com/auth/webmasters"))
  const [chosenAccount, setChosenAccount] = useState("")
  const [chosenProperty, setChosenProperty] = useState("")
  const accountId = accounts.some(account => account.id === chosenAccount) ? chosenAccount : accounts.find(account => account.id === snapshot?.googleAccountId)?.id ?? accounts[0]?.id ?? ""
  const properties = useSearchConsoleProperties(projectId, accountId)
  const propertyUrl = properties.data?.properties.some(property => property.siteUrl === chosenProperty) ? chosenProperty : properties.data?.properties.find(property => property.siteUrl === snapshot?.propertyUrl)?.siteUrl ?? properties.data?.properties[0]?.siteUrl ?? ""
  const sync = useSyncSearchConsole(projectId)
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Search className="size-4" />Prioriser avec Search Console</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Importez 28 jours de données finalisées, avec trois jours de décalage. Les impressions des pages concernées pondèrent les priorités.</p>
      {snapshot && <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
        <p className="font-medium break-all">{snapshot.propertyUrl}</p>
        <p>Du {date(snapshot.startDate)} au {date(snapshot.endDate)} · {number(snapshot.pageCount)} pages · import du {date(snapshot.importedAt)}</p>
        <p className="text-muted-foreground">L’API Google fournit les principales lignes et ne garantit pas une couverture exhaustive.{snapshot.rowLimitReached ? " La limite de 25 000 lignes a été atteinte." : ""}</p>
        {snapshot.stale && <p className="text-amber-700">Ces données ont plus de 35 jours : elles ne pondèrent plus les priorités. Actualisez l’import.</p>}
      </div>}
      {accountsLoading ? <Skeleton className="h-10 w-full" /> : accountsError ? <p role="alert" className="text-sm text-destructive">{accountsError.message}</p> : accounts.length === 0 ? <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Aucun compte connecté avec les droits Search Console.</p>
        {canEdit && <Button variant="outline" onClick={() => apiClient.connectGoogleAnalytics()}>Connecter Google</Button>}
      </div> : <div className="flex flex-col gap-3 md:flex-row">
        <Select value={accountId} onValueChange={value => { setChosenAccount(value); setChosenProperty("") }} disabled={sync.isPending || !canEdit}>
          <SelectTrigger className="w-full md:w-64" aria-label="Compte Google"><SelectValue placeholder="Compte Google" /></SelectTrigger>
          <SelectContent>{accounts.map(account => <SelectItem key={account.id} value={account.id}>{account.label ?? account.googleEmail}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={propertyUrl} onValueChange={setChosenProperty} disabled={properties.isLoading || sync.isPending || !canEdit}>
          <SelectTrigger className="w-full md:flex-1" aria-label="Propriété Search Console"><SelectValue placeholder={properties.isLoading ? "Chargement…" : "Choisir une propriété"} /></SelectTrigger>
          <SelectContent>{properties.data?.properties.map(property => <SelectItem key={property.siteUrl} value={property.siteUrl}>{property.siteUrl}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => sync.mutate({ googleAccountId: accountId, propertyUrl })} disabled={!canEdit || !propertyUrl || sync.isPending}><RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} />{sync.isPending ? "Import en cours…" : "Importer"}</Button>
      </div>}
      {properties.error && <p role="alert" className="text-sm text-destructive">{properties.error.message}</p>}
      {accountId && properties.isSuccess && !properties.data.properties.length && <p className="text-sm text-muted-foreground">Aucune propriété autorisée ne couvre ce projet. Vérifiez son domaine et les droits Google.</p>}
      {sync.error && <p role="alert" className="text-sm text-destructive">{sync.error.message}</p>}
    </CardContent>
  </Card>
}

function ActionCard({ action, projectId, canEdit, rank, hasSearchConsole, analytics }: { action: SeoActionItem; projectId: string; canEdit: boolean; rank: number; hasSearchConsole: boolean; analytics?: ProjectAnalytics }) {
  const update = useUpdateSeoAction(projectId)
  const [draftNote, setDraftNote] = useState<string | null>(null)
  const isRegression = action.status === "VERIFIED" && action.affectedPages > 0
  return <Card>
    <CardHeader className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs text-muted-foreground mb-1">Priorité #{rank} · indice {action.priorityScore.toLocaleString("fr-FR")}</p><CardTitle className="text-lg">{action.title}</CardTitle></div>
        <Badge variant={isRegression ? "destructive" : action.status === "VERIFIED" ? "default" : "secondary"}>{isRegression ? "Régression à traiter" : STATUS_LABELS[action.status]}</Badge>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">{action.affectedPages > 0 && <><Badge variant="outline">Gravité : {PRIORITY_LABELS[action.priority]}</Badge><Badge variant="outline">Effort : {EFFORT_LABELS[action.effort]}</Badge></>}<Badge variant="outline">{action.affectedPages} page(s) avec un problème actif</Badge><Badge variant="outline">{CONFIDENCE_LABELS[action.confidence]}</Badge></div>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{action.reason}</p>
      {action.search && <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted p-3 text-sm md:grid-cols-4">
        <div><p className="text-muted-foreground">Impressions</p><p className="font-semibold">{number(action.search.impressions)}</p></div><div><p className="text-muted-foreground">Clics</p><p className="font-semibold">{number(action.search.clicks)}</p></div>
        <div><p className="text-muted-foreground">CTR</p><p className="font-semibold">{(action.search.ctr * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %</p></div><div><p className="text-muted-foreground">Position moyenne</p><p className="font-semibold">{action.search.position.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</p></div>
      </div>}
      {action.evidence.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Preuves et corrections attendues · {action.evidence.length} exemple(s)</summary>
        <div className="mt-3 space-y-3">{action.evidence.map(evidence => <div key={evidence.pageUrl} className="border-t pt-3 text-sm space-y-1 [overflow-wrap:anywhere]">
          <a href={evidence.pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 text-primary"><span className="min-w-0 break-all">{evidence.pageUrl}</span><ExternalLink className="size-3 shrink-0" /></a><p>{evidence.message}</p>
          <p className="text-muted-foreground">Mesuré : {evidence.value ?? "Non renseigné par ce contrôle"}</p><p className="text-muted-foreground">Attendu : {evidence.expected ?? "Consultez le détail du contrôle dans l’audit"}</p>
        </div>)}</div>
      </details>}
      {action.verifiedAuditId && <p className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="size-4" />Vérifiée le {action.verifiedAt ? date(action.verifiedAt) : "—"} · <Link className="underline" href={`/audits/${action.verifiedAuditId}`}>voir l’audit de preuve</Link></p>}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={action.status} disabled={!canEdit || update.isPending} onValueChange={status => {
          if (status !== "VERIFIED") update.mutate({ checkName: action.checkName, status: status as Exclude<SeoActionStatus, "VERIFIED">, ...(draftNote === null ? {} : { note: draftNote }) }, { onSuccess: () => setDraftNote(null) })
        }}>
          <SelectTrigger className="w-60" aria-label={`Statut : ${action.title}`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_LABELS).map(([status, label]) => <SelectItem key={status} value={status} disabled={status === "VERIFIED" || (status === "IMPLEMENTED" && !action.affectedPages)}>{label}</SelectItem>)}</SelectContent>
        </Select><p className="text-xs text-muted-foreground">« Correction effectuée » attend une confirmation par un nouvel audit.</p>
      </div>
      <div className="space-y-2"><label htmlFor={`note-${action.checkName}`} className="text-sm font-medium">Note de suivi</label>
        <Textarea id={`note-${action.checkName}`} value={draftNote ?? action.note} onChange={event => setDraftNote(event.target.value)} maxLength={2000} disabled={!canEdit || action.status === "VERIFIED" || update.isPending} placeholder="Correction prévue, responsable ou observations…" />
        {draftNote !== null && action.status !== "VERIFIED" && <Button variant="outline" size="sm" disabled={update.isPending} onClick={() => update.mutate({ checkName: action.checkName, status: action.status as Exclude<SeoActionStatus, "VERIFIED">, note: draftNote }, { onSuccess: () => setDraftNote(null) })}>Enregistrer la note</Button>}
      </div>
      {update.error && <p role="alert" className="text-sm text-destructive">{update.error.message}</p>}
      <ActionOutcome key={action.implementedAt} action={action} projectId={projectId} canEdit={canEdit} hasSearchConsole={hasSearchConsole} />
      <AnalyticsOutcome key={`ga4-${action.implementedAt}-${analytics?.actions.find(item => item.checkName === action.checkName)?.measurement?.id ?? "none"}`} action={action} analytics={analytics} projectId={projectId} canEdit={canEdit} />
    </CardContent>
  </Card>
}

function ProjectActionPlan({ projectId, prioritiesOnly }: { projectId: string; prioritiesOnly: boolean }) {
  const router = useRouter()
  const { isMember } = useRole()
  const { data, isLoading, error, refetch, isFetching } = useActionPlan(projectId)
  const analytics = useProjectAnalytics(projectId)
  const verify = useVerifySeoActions(projectId)
  const launch = useLaunchAudit({ onAuditCreated: id => router.push(`/audits/${id}`) })
  const [showClosed, setShowClosed] = useState(false)
  if (isLoading) return <div className="space-y-4">{[0, 1, 2].map(value => <Skeleton key={value} className="h-32 w-full" />)}</div>
  if (error) return <Card><CardContent className="pt-6 space-y-3"><p role="alert">{error.message}</p><Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>Réessayer</Button></CardContent></Card>
  if (!data) return null
  const open = data.actions.filter(action => !["DISMISSED", "VERIFIED"].includes(action.status) || (action.status === "VERIFIED" && action.affectedPages > 0))
  const visible = prioritiesOnly ? open.slice(0, 3) : showClosed ? data.actions : open
  return <div className="space-y-6">
    <SearchConsolePanel projectId={projectId} snapshot={data.searchConsole} canEdit={isMember} />
    <AnalyticsPanel projectId={projectId} data={analytics.data} canEdit={isMember} isLoading={analytics.isLoading} error={analytics.error} />
    <p className="text-sm"><Link href="/internal-linking" className="text-primary underline">Explorer le maillage interne et les suggestions de liens</Link></p>
    <p className="text-sm"><Link href="/cms-connections" className="text-primary underline">Connecter le CMS et préparer les corrections SEO</Link></p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">{data.audit ? <p>Dernier audit : {data.audit.completedAt ? date(data.audit.completedAt) : "—"} · {data.audit.pageCount} pages · <Link className="underline" href={`/audits/${data.audit.id}`}>détails</Link></p> : <p>Lancez un premier audit pour construire votre plan d’action.</p>}</div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className="size-4" />Actualiser</Button><Button size="sm" variant="outline" disabled={!isMember || verify.isPending || !data.audit} onClick={() => verify.mutate()}><CheckCircle2 className="size-4" />Vérifier les corrections</Button><Button size="sm" disabled={!isMember || launch.isPending} onClick={() => launch.mutate({ projectId })}>{launch.isPending ? "Lancement…" : "Relancer un audit"}</Button></div>
    </div>
    {!prioritiesOnly && <Button size="sm" variant="ghost" onClick={() => setShowClosed(value => !value)}>{showClosed ? "Masquer" : "Afficher"} les actions vérifiées et écartées ({data.actions.length - open.length})</Button>}
    {prioritiesOnly && <p className="text-sm text-muted-foreground">Les trois premières actions actives. <Link href="/optimization" className="underline">Voir tout le plan ({open.length})</Link></p>}
    {visible.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">{data.audit ? "Aucune action active dans le périmètre du dernier audit." : "Aucun audit terminé pour ce projet."}</CardContent></Card> : visible.map((action, index) => <ActionCard key={`${projectId}-${action.checkName}`} action={action} projectId={projectId} canEdit={isMember} hasSearchConsole={!!data.searchConsole} analytics={analytics.data} rank={index + 1} />)}
    {verify.data && verify.data.pending.length > 0 && <Card><CardContent className="pt-6 space-y-2"><p className="font-medium">Vérifications en attente</p>{verify.data.pending.map(item => <p key={item.checkName} className="text-sm text-muted-foreground">{data.actions.find(action => action.checkName === item.checkName)?.title ?? item.checkName} : {item.reason}</p>)}</CardContent></Card>}
    {verify.error && <p role="alert" className="text-sm text-destructive">{verify.error.message}</p>}
  </div>
}

export function ActionPlanPanel({ prioritiesOnly = false }: { prioritiesOnly?: boolean }) {
  const { activeProjectId, activeProject, setActiveProjectId } = useActiveProject()
  const { data: projects, isLoading, error } = useProjects()
  return <div className="p-4 md:p-6 space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><ListChecks className="size-6 text-primary" />{prioritiesOnly ? "Vos prochaines actions" : "Plan d’action SEO"}</h1><p className="text-sm text-muted-foreground mt-1">{activeProject?.name ?? "Choisissez un projet"} · Décider, corriger, puis vérifier.</p></div>
      <Select value={activeProjectId ?? ""} onValueChange={setActiveProjectId} disabled={isLoading}><SelectTrigger className="w-full md:w-72" aria-label="Projet du plan d’action"><SelectValue placeholder="Sélectionner un projet" /></SelectTrigger><SelectContent>{projects?.map(project => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select>
    </div>
    {error && <p role="alert" className="text-destructive">{error.message}</p>}
    {activeProjectId ? <ProjectActionPlan key={activeProjectId} projectId={activeProjectId} prioritiesOnly={prioritiesOnly} /> : <Card><CardContent className="py-10 text-center text-muted-foreground">Sélectionnez un projet pour afficher ses priorités.{projects?.length === 0 && <p className="mt-2"><Link href="/projects" className="underline">Créer votre premier projet</Link></p>}</CardContent></Card>}
  </div>
}
