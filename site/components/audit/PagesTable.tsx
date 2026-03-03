"use client"

import { useState } from "react"
import type { PageResult } from "@/lib/api-client"

interface PageRow {
  id: string
  url: string
  statusCode: number | null
  results: PageResult[]
}

interface PagesTableProps {
  pages: PageRow[]
}

function categoryScore(results: PageResult[], category: string): number | null {
  const checks = results.filter((r) => r.category === category)
  if (checks.length === 0) return null
  return Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length)
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-300">—</span>
  const color = score >= 75 ? "text-emerald-600" : score >= 50 ? "text-orange-500" : "text-red-500"
  const bg = score >= 75 ? "bg-emerald-50" : score >= 50 ? "bg-orange-50" : "bg-red-50"
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color} ${bg}`}>
      {score}
    </span>
  )
}

export function PagesTable({ pages }: PagesTableProps) {
  const [sortCol, setSortCol] = useState<string>("url")
  const [sortAsc, setSortAsc] = useState(true)

  const columns = [
    { key: "url", label: "URL" },
    { key: "status", label: "HTTP" },
    { key: "technical", label: "Technique" },
    { key: "onPage", label: "On-Page" },
    { key: "performance", label: "Perf" },
    { key: "uxMobile", label: "Mobile" },
  ]

  const rows = pages.map((p) => ({
    ...p,
    technical: categoryScore(p.results, "TECHNICAL"),
    onPage: categoryScore(p.results, "ON_PAGE"),
    performance: categoryScore(p.results, "PERFORMANCE"),
    uxMobile: categoryScore(p.results, "UX_MOBILE"),
  }))

  const sorted = [...rows].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    if (sortCol === "url") return dir * a.url.localeCompare(b.url)
    if (sortCol === "status") return dir * ((a.statusCode ?? 0) - (b.statusCode ?? 0))
    const aVal = (a as Record<string, unknown>)[sortCol] as number | null
    const bVal = (b as Record<string, unknown>)[sortCol] as number | null
    return dir * ((aVal ?? 0) - (bVal ?? 0))
  })

  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortAsc(!sortAsc)
    } else {
      setSortCol(col)
      setSortAsc(true)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left text-xs font-semibold text-slate-500 py-3 px-3 cursor-pointer select-none hover:text-slate-700"
                onClick={() => toggleSort(col.key)}
              >
                {col.label}
                {sortCol === col.key && (
                  <span className="ml-1">{sortAsc ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="py-2.5 px-3 max-w-[300px]">
                <span className="text-slate-700 truncate block" title={row.url}>
                  {row.url.replace(/^https?:\/\//, "")}
                </span>
              </td>
              <td className="py-2.5 px-3">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  row.statusCode === 200 ? "bg-emerald-50 text-emerald-700"
                    : row.statusCode && row.statusCode < 400 ? "bg-orange-50 text-orange-700"
                    : "bg-red-50 text-red-700"
                }`}>
                  {row.statusCode ?? "—"}
                </span>
              </td>
              <td className="py-2.5 px-3"><ScoreCell score={row.technical} /></td>
              <td className="py-2.5 px-3"><ScoreCell score={row.onPage} /></td>
              <td className="py-2.5 px-3"><ScoreCell score={row.performance} /></td>
              <td className="py-2.5 px-3"><ScoreCell score={row.uxMobile} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">Aucune page</div>
      )}
    </div>
  )
}
