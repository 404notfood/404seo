"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScoreGauge } from "./ScoreGauge"
import { IssueList } from "./IssueList"
import { CATEGORY_LABELS } from "@/lib/check-labels"
import { groupAuditFindings } from "@seo/shared/audit-findings"
import type { AuditCheckOccurrence } from "@seo/shared"

interface ThematicSectionProps {
  category: string
  score: number
  results: AuditCheckOccurrence[]
}

export function ThematicSection({ category, score, results }: ThematicSectionProps) {
  const findings = groupAuditFindings(results).filter(finding => finding.category === category)

  if (findings.length === 0) return null

  const label = CATEGORY_LABELS[category] ?? category

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <ScoreGauge score={Math.round(score)} size={56} />
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              {findings.length} contrôles regroupés · détail par page disponible
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <IssueList findings={findings} />
      </CardContent>
    </Card>
  )
}
