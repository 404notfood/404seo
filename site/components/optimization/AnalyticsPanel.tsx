"use client"

import { useState } from "react"
import type { ProjectAnalytics } from "@seo/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGoogleStatus } from "@/hooks/useGoogle"
import { useAnalyticsProperty, useProjectAnalytics, useSyncAnalytics } from "@/hooks/useAnalytics"
import { apiClient } from "@/lib/api-client"
import { AnalyticsQuality, analyticsDate, analyticsMoney, analyticsNumber } from "./AnalyticsQuality"

function LandingPages({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const { data, isLoading, error, isFetching } = useProjectAnalytics(projectId, page)
  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (error) return <p role="alert">{error.message}</p>
  if (!data?.snapshot) return null
  const snapshot = data.snapshot
  return <div className="space-y-3 mt-3">
    <p className="text-xs text-muted-foreground">Classement par événements clés, puis sessions. Pages d’entrée regroupées hors paramètres d’URL.</p>
    {data.pages.map(row => <div key={row.pageUrl} className="space-y-2 rounded-lg border p-3 text-sm">
      <a className="break-all text-primary underline" href={row.pageUrl} target="_blank" rel="noopener noreferrer">{row.pageUrl}</a>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3"><div><dt className="text-muted-foreground">Sessions naturelles</dt><dd>{analyticsNumber(row.sessions)}</dd></div><div><dt className="text-muted-foreground">Événements clés</dt><dd>{analyticsNumber(row.keyEvents)}</dd></div><div><dt className="text-muted-foreground">Revenu d’achat</dt><dd>{analyticsMoney(row.purchaseRevenue, snapshot.currencyCode)}</dd></div></dl>
    </div>)}
    {data.total > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p>{data.total} page(s) · {data.page}/{data.pageCount}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={isFetching || data.page <= 1} onClick={() => setPage(data.page - 1)}>Précédent</Button><Button size="sm" variant="outline" disabled={isFetching || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Suivant</Button></div></div>}
  </div>
}

export function AnalyticsPanel({ projectId, data, canEdit, isLoading, error }: { projectId: string; data?: ProjectAnalytics; canEdit: boolean; isLoading: boolean; error: Error | null }) {
  const { data: googleStatus, error: googleError } = useGoogleStatus()
  const accounts = (googleStatus?.accounts ?? []).filter(account => account.scopes.some(scope => scope === "https://www.googleapis.com/auth/analytics.readonly" || scope === "https://www.googleapis.com/auth/analytics.edit"))
  const snapshot = data?.snapshot
  const [chosenAccount, setChosenAccount] = useState("")
  const accountId = accounts.some(account => account.id === chosenAccount) ? chosenAccount : accounts.find(account => account.id === snapshot?.googleAccountId)?.id ?? accounts[0]?.id ?? ""
  const [draft, setDraft] = useState<string | null>(null)
  const input = draft ?? snapshot?.propertyId.replace("properties/", "") ?? ""
  const [validated, setValidated] = useState("")
  const [streamChoice, setStreamChoice] = useState("")
  const [showPages, setShowPages] = useState(false)
  const property = useAnalyticsProperty(projectId, accountId, validated)
  const streams = property.data?.streams ?? []
  const streamId = streams.some(stream => stream.id === streamChoice) ? streamChoice : streams[0]?.id ?? ""
  const sync = useSyncAnalytics(projectId)
  const propertyId = input.startsWith("properties/") ? input.trim() : `properties/${input.trim()}`
  const canImport = !!property.data && property.data.propertyId === propertyId && !!streamId && !property.isFetching
  return <Card>
    <CardHeader><CardTitle className="text-base">Conversions et valeur du trafic naturel · GA4</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Sessions classées « Organic Search », événements clés et revenus d’achat liés aux pages d’entrée. Les événements clés doivent être configurés dans GA4 et le suivi e-commerce doit transmettre les achats.</p>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      {snapshot && <div className="rounded-lg bg-muted p-3 space-y-3 text-sm">
        <p className="font-medium break-all">{snapshot.displayName} · {snapshot.propertyId} · flux {snapshot.streamId}</p>
        <p className="text-xs text-muted-foreground">Du {analyticsDate(snapshot.startDate)} au {analyticsDate(snapshot.endDate)} · {snapshot.timeZone} · {snapshot.currencyCode} · import du {new Date(snapshot.importedAt).toLocaleString("fr-FR")}</p>
        {data?.summary ? <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><dt className="text-muted-foreground">Sessions naturelles</dt><dd className="font-semibold">{analyticsNumber(data.summary.sessions)}</dd></div><div><dt className="text-muted-foreground">Événements clés</dt><dd className="font-semibold">{analyticsNumber(data.summary.keyEvents)}</dd></div><div><dt className="text-muted-foreground">Revenu d’achat</dt><dd className="font-semibold">{analyticsMoney(data.summary.purchaseRevenue, snapshot.currencyCode)}</dd></div></dl> : <p>Aucune page d’entrée exploitable : performances indisponibles.</p>}
        <AnalyticsQuality quality={snapshot} />
        {snapshot.stale && <p className="text-xs text-amber-700">Cet import a plus de 35 jours. Actualisez les données avant de décider.</p>}
      </div>}
      {googleError && <p role="alert" className="text-sm text-destructive">{googleError.message}</p>}
      {accounts.length === 0 ? <div className="space-y-2"><p className="text-sm text-muted-foreground">Connectez un compte Google avec les droits Analytics.</p>{canEdit && <Button variant="outline" onClick={() => apiClient.connectGoogleAnalytics()}>Connecter Google pour GA4</Button>}</div> : <div className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row">
          <Select value={accountId} disabled={!canEdit || sync.isPending} onValueChange={value => { setChosenAccount(value); setValidated(""); setStreamChoice("") }}><SelectTrigger aria-label="Compte Google Analytics" className="w-full md:w-64"><SelectValue /></SelectTrigger><SelectContent>{accounts.map(account => <SelectItem key={account.id} value={account.id}>{account.label ?? account.googleEmail}</SelectItem>)}</SelectContent></Select>
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={event => { event.preventDefault(); if (validated === propertyId) void property.refetch(); else setValidated(propertyId); setStreamChoice("") }}>
            <Input aria-label="Identifiant de propriété GA4" placeholder="ID GA4, ex. 123456789" maxLength={40} value={input} disabled={!canEdit || sync.isPending} onChange={event => setDraft(event.target.value)} />
            <Button type="submit" variant="outline" disabled={!canEdit || !/^properties\/[0-9]{1,20}$/.test(propertyId) || sync.isPending || property.isFetching}>Vérifier GA4</Button>
          </form>
        </div>
        <p className="text-xs text-muted-foreground">Identifiant numérique dans GA4 → Administration → Détails de la propriété. La vérification propose uniquement les flux web couvrant le domaine du projet.</p>
        {property.error && <p role="alert" className="text-sm text-destructive">{property.error.message}</p>}
        {property.data && property.data.propertyId === propertyId && <div className="flex flex-col gap-2 md:flex-row">
          <Select value={streamId} disabled={!canEdit || sync.isPending} onValueChange={setStreamChoice}><SelectTrigger aria-label="Flux web GA4" className="w-full md:flex-1"><SelectValue placeholder="Choisir un flux web" /></SelectTrigger><SelectContent>{streams.map(stream => <SelectItem key={stream.id} value={stream.id}>{stream.displayName} · {stream.defaultUri}</SelectItem>)}</SelectContent></Select>
          <Button disabled={!canEdit || !canImport || sync.isPending} onClick={() => sync.mutate({ googleAccountId: accountId, propertyId, streamId })}>{sync.isPending ? "Import GA4…" : "Importer GA4"}</Button>
        </div>}
        {property.isSuccess && !streams.length && <p className="text-sm text-muted-foreground">Aucun flux web de cette propriété ne couvre le projet.</p>}
        {sync.error && <p role="alert" className="text-sm text-destructive">{sync.error.message}</p>}
      </div>}
      {snapshot && <div className="border-t pt-3"><Button variant="ghost" size="sm" onClick={() => setShowPages(value => !value)}>{showPages ? "Masquer" : "Voir"} les pages d’entrée GA4 ({data?.total ?? 0})</Button>{showPages && <LandingPages key={snapshot.id} projectId={projectId} />}</div>}
      <p className="text-xs text-muted-foreground">Les revenus décrivent les achats mesurés par GA4, pas un bénéfice ni un ROI. Les sommes de plusieurs actions peuvent recouvrir les mêmes pages. Le canal naturel inclut plusieurs moteurs ; ses sessions ne correspondent pas aux clics Google Search Console.</p>
    </CardContent>
  </Card>
}
