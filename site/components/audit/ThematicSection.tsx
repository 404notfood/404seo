"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScoreGauge } from "./ScoreGauge"
import { IssueList } from "./IssueList"
import { CATEGORY_LABELS } from "@/lib/check-labels"
import type { PageResult } from "@/lib/api-client"

interface ThematicSectionProps {
  category: string
  score: number
  results: PageResult[]
}

export function ThematicSection({ category, score, results }: ThematicSectionProps) {
  // Filter results for this category
  const categoryResults = results.filter((r) => r.category === category)

  // Deduplicate by checkName — keep the most severe
  const statusOrder = { FAIL: 0, WARN: 1, PASS: 2 }
  const deduped = new Map<string, PageResult>()
  for (const r of categoryResults) {
    const existing = deduped.get(r.checkName)
    if (!existing || statusOrder[r.status] < statusOrder[existing.status]) {
      deduped.set(r.checkName, r)
    }
  }
  const uniqueResults = [...deduped.values()]

  if (uniqueResults.length === 0) return null

  const label = CATEGORY_LABELS[category] ?? category

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <ScoreGauge score={Math.round(score)} size={56} />
          <div>
            <CardTitle className="text-base">{label}</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              {uniqueResults.length} check{uniqueResults.length > 1 ? "s" : ""} dans cette catégorie
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <IssueList results={uniqueResults} />
      </CardContent>
    </Card>
  )
}
