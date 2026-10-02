import type { AnalyticsQuality as Quality } from "@seo/shared"

export function AnalyticsQuality({ quality }: { quality: Quality }) {
  const notices = [quality.rowLimitReached && "Limite de 10 000 lignes atteinte : certaines pages peuvent manquer.",
    quality.thresholded && "Rapport soumis aux seuils de confidentialité Google.", quality.sampled && "Données échantillonnées par Google.",
    quality.otherRowLoss && "Certaines pages sont regroupées dans la ligne « other » de Google.", quality.truncated && "Google signale une troncature du rapport.",
    quality.revenueRestricted && "Votre accès Google masque les revenus : ils sont affichés comme indisponibles.",
    quality.metadataUnavailable && "Les informations de qualité du rapport n’ont pas été fournies.",
    quality.omittedRows > 0 && `${quality.omittedRows} ligne(s) sans page exploitable dans le périmètre du projet.`, quality.emptyReason && "Google signale un rapport vide : les données sont indisponibles pour au moins une période."].filter(Boolean)
  return notices.length > 0 ? <ul className="space-y-1 text-xs text-amber-700">{notices.map(notice => <li key={String(notice)}>{notice}</li>)}</ul> : null
}

export const analyticsNumber = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
export const analyticsMoney = (value: number | null | undefined, currency: string) => value === null || value === undefined ? "Indisponible" : value.toLocaleString("fr-FR", { style: "currency", currency })
export const analyticsDate = (value: string) => new Date(value).toLocaleDateString("fr-FR", { timeZone: "UTC" })
