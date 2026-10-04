"use client"

import { useState } from "react"
import { searchComparisonWindows } from "@seo/shared"
import type { SeoActionItem } from "@seo/shared"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMeasureSeoAction } from "@/hooks/useSearchInsights"

const date = (value: string) => new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC" })
const numeric = (value: number | null | undefined, decimals = 0) => value === null || value === undefined ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: decimals })
const signed = (value: number | null | undefined, decimals = 0) => value === null || value === undefined ? "—" : `${value > 0 ? "+" : ""}${numeric(value, decimals)}`

export function ActionOutcome({ action, projectId, canEdit, hasSearchConsole }: { action: SeoActionItem; projectId: string; canEdit: boolean; hasSearchConsole: boolean }) {
  const [days, setDays] = useState<7 | 28>(action.measurement?.windowDays ?? 28)
  const measure = useMeasureSeoAction(projectId, action.checkName)
  if (!action.implementedAt || !["IMPLEMENTED", "VERIFIED"].includes(action.status)) return null
  const window = searchComparisonWindows(new Date(action.implementedAt), days)
  const result = action.measurement
  return <section className="space-y-3 rounded-lg border p-3" aria-label={`Évolution Google : ${action.title}`}>
    <h2 className="text-sm font-semibold">Évolution après correction</h2>
    <p className="text-xs text-muted-foreground">Comparaison de périodes égales, avant et après la date déclarée, sur les mêmes URLs. Le jour de correction est exclu.</p>
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(days)} onValueChange={value => setDays(value === "7" ? 7 : 28)} disabled={measure.isPending}>
        <SelectTrigger className="w-40" aria-label={`Période de comparaison : ${action.title}`}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="7">7 jours</SelectItem><SelectItem value="28">28 jours</SelectItem></SelectContent>
      </Select>
      <Button variant="outline" size="sm" disabled={!canEdit || !hasSearchConsole || !window.ready || measure.isPending} onClick={() => measure.mutate(days)}>{measure.isPending ? "Comparaison…" : "Mesurer l’évolution"}</Button>
    </div>
    {!hasSearchConsole && <p className="text-xs text-muted-foreground">Importez Search Console pour choisir la propriété de référence.</p>}
    {!window.ready && <p className="text-xs text-muted-foreground">Période de {days} jours disponible à partir du {date(window.readyOn)}, avec le décalage de trois jours.</p>}
    {measure.error && <p role="alert" className="text-sm text-destructive">{measure.error.message}</p>}
    {result && <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground break-all">{result.propertyUrl} · mesure du {new Date(result.measuredAt).toLocaleString("fr-FR")}</p>
      <p>{result.comparablePages}/{result.expectedPages} page(s) observée(s) dans les deux périodes. Absentes avant : {result.missingBeforePages} ; après : {result.missingAfterPages}.</p>
      <p className="text-xs text-muted-foreground">Avant : {date(result.beforeStartDate)}–{date(result.beforeEndDate)} · Après : {date(result.afterStartDate)}–{date(result.afterEndDate)} ({result.windowDays} jours).</p>
      {result.before && result.after && result.changes ? <div className="overflow-x-auto">
        <table className="w-full text-sm"><caption className="sr-only">Performances Google des pages comparables avant et après correction</caption>
          <thead><tr className="border-b"><th className="py-2 text-left">Mesure</th><th className="px-2 text-right">Avant</th><th className="px-2 text-right">Après</th><th className="px-2 text-right">Écart</th></tr></thead>
          <tbody>
            <tr><th className="py-2 text-left font-normal">Clics</th><td className="px-2 text-right">{numeric(result.before.clicks)}</td><td className="px-2 text-right">{numeric(result.after.clicks)}</td><td className="px-2 text-right">{signed(result.changes.clicks)}{result.changes.clicksPercent !== null && ` (${signed(result.changes.clicksPercent, 1)} %)`}</td></tr>
            <tr><th className="py-2 text-left font-normal">Impressions</th><td className="px-2 text-right">{numeric(result.before.impressions)}</td><td className="px-2 text-right">{numeric(result.after.impressions)}</td><td className="px-2 text-right">{signed(result.changes.impressions)}</td></tr>
            <tr><th className="py-2 text-left font-normal">CTR</th><td className="px-2 text-right">{numeric(result.before.ctr === null ? null : result.before.ctr * 100, 2)} %</td><td className="px-2 text-right">{numeric(result.after.ctr === null ? null : result.after.ctr * 100, 2)} %</td><td className="px-2 text-right">{signed(result.changes.ctrPoints, 2)} pt</td></tr>
            <tr><th className="py-2 text-left font-normal">Position</th><td className="px-2 text-right">{numeric(result.before.position, 1)}</td><td className="px-2 text-right">{numeric(result.after.position, 1)}</td><td className="px-2 text-right">{signed(result.changes.position, 1)}</td></tr>
          </tbody>
        </table>
      </div> : <p className="text-muted-foreground">Aucune page comparable : les données manquantes ne sont pas remplacées par des zéros.</p>}
      <p className="text-xs text-muted-foreground">Une position plus basse est meilleure. Cette comparaison décrit une évolution, sans attribuer le changement à la correction seule : saisonnalité et changements de Google peuvent intervenir.</p>
      {result.rowLimitReached && <p className="text-xs text-amber-700">La limite de lignes Google a été atteinte sur au moins une période. Le périmètre comparable peut être incomplet.</p>}
      {result.comparableExamples.length > 0 && <details><summary className="cursor-pointer text-xs font-medium">Exemples de pages comparées</summary><ul className="mt-2 space-y-1">{result.comparableExamples.map(url => <li key={url} className="break-all"><a className="text-primary underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul></details>}
    </div>}
  </section>
}
