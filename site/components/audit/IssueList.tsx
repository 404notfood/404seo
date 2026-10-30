"use client"

import { useId, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AlertTriangle, XCircle, CheckCircle, ChevronDown, ExternalLink, Lightbulb } from "lucide-react"
import { CATEGORY_LABELS, CHECK_ADVICE, getCheckLabel } from "@/lib/check-labels"
import { findingCoverageLabel, groupAuditFindings } from "@seo/shared/audit-findings"
import type { AuditCheckOccurrence, AuditFinding } from "@seo/shared"

interface IssueListProps {
  results?: AuditCheckOccurrence[]
  findings?: AuditFinding[]
  compact?: boolean
}

const EMPTY_RESULTS: AuditCheckOccurrence[] = []
const STATUS_CONFIG = {
  FAIL: { icon: XCircle, label: "À corriger", color: "text-red-600", bg: "bg-red-50", badge: "border-red-200 bg-red-50 text-red-700" },
  WARN: { icon: AlertTriangle, label: "À vérifier", color: "text-amber-600", bg: "bg-amber-50", badge: "border-amber-200 bg-amber-50 text-amber-800" },
  PASS: { icon: CheckCircle, label: "Conforme", color: "text-emerald-600", bg: "bg-emerald-50", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
}
const PRIORITY_LABELS = { HIGH: "Haute", MEDIUM: "Moyenne", LOW: "Faible" }
const EVIDENCE_PAGE_SIZE = 10

function FindingEvidence({ finding }: { finding: AuditFinding }) {
  const [showPassed, setShowPassed] = useState(false)
  const [page, setPage] = useState(0)
  const observations = showPassed || finding.status === "PASS"
    ? finding.occurrences : finding.occurrences.filter(check => check.status !== "PASS")
  const pageCount = Math.max(1, Math.ceil(observations.length / EVIDENCE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = observations.slice(currentPage * EVIDENCE_PAGE_SIZE, (currentPage + 1) * EVIDENCE_PAGE_SIZE)
  const advice = CHECK_ADVICE[finding.checkName]

  return (
    <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
      {advice && finding.status !== "PASS" && (
        <div className="flex gap-2.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-sm leading-relaxed text-blue-900">{advice}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {finding.hasPageContext ? "Pages et constats" : "Constats détaillés"}
        </h4>
        {finding.status !== "PASS" && finding.passCount > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { setShowPassed(!showPassed); setPage(0) }}>
            {showPassed ? "Masquer les pages conformes" : `Voir aussi les ${finding.passCount} pages conformes`}
          </Button>
        )}
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {visible.map((check, index) => {
          const config = STATUS_CONFIG[check.status]
          const Icon = config.icon
          return (
            <div key={`${check.pageUrl ?? check.pageId ?? check.id ?? "check"}:${index}`} className="space-y-1.5 p-3 text-sm">
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.color)} aria-label={config.label} />
                {check.pageUrl && /^https?:\/\//i.test(check.pageUrl) ? (
                  <a href={check.pageUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-medium text-blue-700 hover:underline">
                    {check.pageUrl}<ExternalLink className="ml-1 inline h-3 w-3" />
                  </a>
                ) : <span className="font-medium text-slate-700">Constat {currentPage * EVIDENCE_PAGE_SIZE + index + 1}</span>}
              </div>
              <p className="break-words leading-relaxed text-slate-600">{check.message}</p>
              {check.evidence?.length ? (
                <details className="rounded-md border border-slate-100 bg-slate-50 px-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-blue-700">
                    {check.evidence.length === 1 ? "Voir l’élément relevé" : `Voir les ${check.evidence.length} éléments relevés`}{check.evidence.length === 100 ? " (100 premiers au maximum)" : ""}
                  </summary>
                  <ul className="divide-y divide-slate-200 pb-2">
                    {check.evidence.map((item, itemIndex) => (
                      <li key={itemIndex} className="space-y-1 py-2 text-xs text-slate-600">
                        <p className="break-words font-medium">{item.label}{item.width !== undefined && item.height !== undefined ? ` — ${item.width} × ${item.height} px` : ""}</p>
                        {item.url && /^https?:\/\//i.test(item.url) && <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-block min-h-6 break-all text-blue-700 hover:underline">{item.url}<ExternalLink className="ml-1 inline h-3 w-3" /></a>}
                        {item.selector && <p className="break-all font-mono text-[11px]">{item.selector}</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : check.status !== "PASS" && ["images_alt", "tap_targets"].includes(check.checkName) ? (
                <p className="text-xs text-slate-500">Les éléments précis n’ont pas été conservés dans cet ancien audit. Relancez l’audit pour les obtenir.</p>
              ) : null}
              {(check.value || check.expected) && (
                <dl className="grid gap-1 break-words text-xs sm:grid-cols-2">
                  {check.value && <div><dt className="text-slate-400">Valeur observée</dt><dd className="mt-0.5 text-slate-700">{check.value}</dd></div>}
                  {check.expected && <div><dt className="text-slate-400">Référence du contrôle</dt><dd className="mt-0.5 text-slate-700">{check.expected}</dd></div>}
                </dl>
              )}
            </div>
          )
        })}
      </div>
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{currentPage * EVIDENCE_PAGE_SIZE + 1}-{Math.min((currentPage + 1) * EVIDENCE_PAGE_SIZE, observations.length)} sur {observations.length}</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Précédent</Button>
            <Button type="button" variant="outline" size="sm" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Suivant</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function FindingCard({ finding, compact }: { finding: AuditFinding; compact: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const { icon: Icon, color, bg, badge, label } = STATUS_CONFIG[finding.status]
  const affected = finding.occurrences.filter(check => check.status !== "PASS")
  const messages = new Set(affected.map(check => check.message))
  const summary = finding.status === "PASS" ? "Contrôle conforme sur toutes les pages vérifiées."
    : messages.size === 1 ? affected[0].message
    : `${finding.affectedCount} ${finding.hasPageContext ? "pages présentent" : "constats présentent"} des écarts. Les valeurs et les cas relevés sont détaillés ci-dessous.`
  const coverageSuffix = finding.status === "PASS" ? (finding.checkedCount > 1 ? "conformes" : "conforme")
    : finding.hasPageContext ? (finding.checkedCount > 1 ? "concernées" : "concernée")
    : finding.affectedCount > 1 ? "concernés" : "concerné"

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)} className="min-h-11 w-full p-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}><Icon className={cn("h-4 w-4", color)} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{getCheckLabel(finding.checkName)}</span>
              {!compact && <Badge variant="outline" className={cn("text-[10px]", badge)}>{label}</Badge>}
            </div>
            {expanded && !compact && <p className="mt-1.5 break-words text-sm leading-relaxed text-slate-600">{summary}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{findingCoverageLabel(finding)} {coverageSuffix}</span>
              {!compact && <><span>{CATEGORY_LABELS[finding.category]}</span><span>Priorité {PRIORITY_LABELS[finding.priority].toLowerCase()}</span></>}
              {!compact && <span className="text-blue-700">{expanded ? "Masquer les détails" : "Voir les pages et éléments"}</span>}
            </div>
          </div>
          <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} />
        </div>
      </button>
      <div id={panelId} hidden={!expanded}>{expanded && <FindingEvidence finding={finding} />}</div>
    </div>
  )
}

export function IssueList({ results = EMPTY_RESULTS, findings: providedFindings, compact = false }: IssueListProps) {
  const findings = useMemo(() => providedFindings ?? groupAuditFindings(results), [providedFindings, results])
  if (!findings.length) return <p className="py-8 text-center text-sm text-slate-400">Aucun résultat dans cette section</p>
  return <div className={compact ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>{findings.map(finding => <FindingCard key={finding.key} finding={finding} compact={compact} />)}</div>
}
