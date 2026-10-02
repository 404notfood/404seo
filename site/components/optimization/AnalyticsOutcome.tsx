"use client"

import { useState } from "react"
import { searchComparisonWindows } from "@seo/shared"
import type { ProjectAnalytics, SeoActionItem } from "@seo/shared"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMeasureAnalytics } from "@/hooks/useAnalytics"
import { AnalyticsQuality, analyticsDate, analyticsMoney, analyticsNumber } from "./AnalyticsQuality"

const signed = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${analyticsNumber(value)}`

export function AnalyticsOutcome({ action, analytics, projectId, canEdit }: { action: SeoActionItem; analytics?: ProjectAnalytics; projectId: string; canEdit: boolean }) {
  const item = analytics?.actions.find(item => item.checkName === action.checkName)
  const result = item?.measurement
  const [days, setDays] = useState<7 | 28>(result?.windowDays ?? 28)
  const measure = useMeasureAnalytics(projectId, action.checkName)
  const source = analytics?.snapshot
  const exposure = item?.exposure
  const corrected = !!action.implementedAt && ["IMPLEMENTED", "VERIFIED"].includes(action.status)
  const window = corrected && source ? searchComparisonWindows(new Date(action.implementedAt!), days, new Date(), source.timeZone) : null
  if (!source && !result) return null
  return <section aria-label={`Résultats GA4 : ${action.title}`} className="rounded-lg border p-3 space-y-3 text-sm">
    <h2 className="text-sm font-semibold">Valeur des pages d’entrée · GA4</h2>
    {exposure ? <>
      <p className="text-xs text-muted-foreground">{exposure.matchedPages}/{exposure.expectedPages} chemin(s) associé(s) à l’action dans l’import {source && `${analyticsDate(source.startDate)}–${analyticsDate(source.endDate)}`}. Paramètres d’URL regroupés.</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div><dt className="text-muted-foreground">Sessions naturelles</dt><dd className="font-semibold">{analyticsNumber(exposure.sessions)}</dd></div><div><dt className="text-muted-foreground">Événements clés</dt><dd className="font-semibold">{analyticsNumber(exposure.keyEvents)}</dd></div><div><dt className="text-muted-foreground">Revenu d’achat</dt><dd className="font-semibold">{analyticsMoney(exposure.purchaseRevenue, exposure.currencyCode)}</dd></div></dl>
      {exposure.stale && <p className="text-xs text-amber-700">Import de plus de 35 jours : actualisez GA4 avant de décider.</p>}
    </> : <p className="text-xs text-muted-foreground">Aucune page d’entrée correspondante dans cet import GA4. Cela ne prouve pas une absence de sessions ou de conversions.</p>}
    {source && <AnalyticsQuality quality={source} />}
    {corrected && <>
      <div className="flex flex-wrap items-center gap-2"><Select value={String(days)} disabled={measure.isPending} onValueChange={value => setDays(value === "7" ? 7 : 28)}><SelectTrigger className="w-40" aria-label={`Période GA4 : ${action.title}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">7 jours</SelectItem><SelectItem value="28">28 jours</SelectItem></SelectContent></Select>
        <Button variant="outline" size="sm" disabled={!canEdit || !window?.ready || measure.isPending} onClick={() => measure.mutate(days)}>{measure.isPending ? "Comparaison GA4…" : "Mesurer les conversions GA4"}</Button></div>
      {window && !window.ready && <p className="text-xs text-muted-foreground">Période complète disponible à partir du {analyticsDate(window.readyOn)} ({source?.timeZone}, décalage de trois jours).</p>}
      {measure.error && <p role="alert" className="text-destructive">{measure.error.message}</p>}
    </>}
    {corrected && result && <div className="space-y-3">
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{result.propertyId} · flux {result.streamId} · {result.timeZone} · {result.currencyCode} · mesure du {new Date(result.measuredAt).toLocaleString("fr-FR")}</p>
      <p>{result.comparablePages}/{result.expectedPages} chemin(s) observé(s) dans les deux périodes. Absents avant : {result.missingBeforePages} ; après : {result.missingAfterPages}.</p>
      <p className="text-xs text-muted-foreground">Avant : {analyticsDate(result.beforeStartDate)}–{analyticsDate(result.beforeEndDate)} · Après : {analyticsDate(result.afterStartDate)}–{analyticsDate(result.afterEndDate)} ({result.windowDays} jours). Jour de correction exclu.</p>
      {result.before && result.after && result.changes ? <>
        <div className="space-y-2 sm:hidden">{[
          ["Sessions", analyticsNumber(result.before.sessions), analyticsNumber(result.after.sessions), `${signed(result.changes.sessions)}${result.changes.sessionsPercent !== null ? ` (${signed(result.changes.sessionsPercent)} %)` : ""}`],
          ["Événements clés", analyticsNumber(result.before.keyEvents), analyticsNumber(result.after.keyEvents), signed(result.changes.keyEvents)],
          ["Revenu d’achat", analyticsMoney(result.before.purchaseRevenue, result.currencyCode), analyticsMoney(result.after.purchaseRevenue, result.currencyCode), analyticsMoney(result.changes.purchaseRevenue, result.currencyCode)],
        ].map(([label, before, after, change]) => <div key={label} className="rounded-lg bg-muted p-2"><h3 className="mb-2 font-medium">{label}</h3><dl className="grid grid-cols-3 gap-2 text-xs [overflow-wrap:anywhere]">{[["Avant", before], ["Après", after], ["Écart", change]].map(([name, value]) => <div key={name}><dt className="text-muted-foreground">{name}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></div>)}</div>
        <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm"><caption className="sr-only">Sessions, événements clés et revenus d’achat avant et après correction</caption>
        <thead><tr className="border-b"><th className="py-2 text-left">Mesure</th><th className="px-2 text-right">Avant</th><th className="px-2 text-right">Après</th><th className="px-2 text-right">Écart</th></tr></thead><tbody>
          <tr><th className="py-2 text-left font-normal">Sessions</th><td className="px-2 text-right">{analyticsNumber(result.before.sessions)}</td><td className="px-2 text-right">{analyticsNumber(result.after.sessions)}</td><td className="px-2 text-right">{signed(result.changes.sessions)}{result.changes.sessionsPercent !== null && ` (${signed(result.changes.sessionsPercent)} %)`}</td></tr>
          <tr><th className="py-2 text-left font-normal">Événements clés</th><td className="px-2 text-right">{analyticsNumber(result.before.keyEvents)}</td><td className="px-2 text-right">{analyticsNumber(result.after.keyEvents)}</td><td className="px-2 text-right">{signed(result.changes.keyEvents)}</td></tr>
          <tr><th className="py-2 text-left font-normal">Revenu d’achat</th><td className="px-2 text-right">{analyticsMoney(result.before.purchaseRevenue, result.currencyCode)}</td><td className="px-2 text-right">{analyticsMoney(result.after.purchaseRevenue, result.currencyCode)}</td><td className="px-2 text-right">{analyticsMoney(result.changes.purchaseRevenue, result.currencyCode)}</td></tr>
        </tbody></table></div></> : <p className="text-muted-foreground">Aucun chemin comparable : les données absentes ne sont pas remplacées par des zéros.</p>}
      <AnalyticsQuality quality={result.quality} />
      {result.comparableExamples.length > 0 && <details><summary className="text-xs font-medium cursor-pointer">Pages d’entrée comparées</summary><ul className="mt-2 space-y-1">{result.comparableExamples.map(url => <li key={url} className="break-all"><a className="text-primary underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul></details>}
      <p className="text-xs text-muted-foreground">Évolution observée du trafic naturel mesuré, sans attribution causale à la correction seule. Une session peut produire plusieurs événements clés ; ces événements ne sont pas des clients uniques. Le revenu peut être négatif après remboursements.</p>
    </div>}
  </section>
}
