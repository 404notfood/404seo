"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Bug, ChevronLeft, ChevronRight, Filter } from "lucide-react"
import { useIssues } from "@/hooks/useAggregation"
import { useActiveProject } from "@/contexts/ProjectContext"
import type { IssueItem } from "@/lib/api-client"

const CATEGORIES = [
  { value: "", label: "Tous" },
  { value: "TECHNICAL", label: "Technique" },
  { value: "ON_PAGE", label: "On-Page" },
  { value: "PERFORMANCE", label: "Performance" },
  { value: "UX_MOBILE", label: "UX" },
]

const STATUSES = [
  { value: "", label: "Tous" },
  { value: "FAIL", label: "FAIL" },
  { value: "WARN", label: "WARN" },
]

const PRIORITIES = [
  { value: "", label: "Tous" },
  { value: "HIGH", label: "Haute" },
  { value: "MEDIUM", label: "Moyenne" },
  { value: "LOW", label: "Basse" },
]

const CATEGORY_COLORS: Record<string, string> = {
  TECHNICAL: "#2563eb",
  ON_PAGE: "#06b6d4",
  PERFORMANCE: "#f59e0b",
  UX_MOBILE: "#10b981",
}

const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL: "Technique",
  ON_PAGE: "On-Page",
  PERFORMANCE: "Performance",
  UX_MOBILE: "UX Mobile",
}

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
}

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
      style={{
        background: active ? "#2563eb" : "#f1f5f9",
        color: active ? "#ffffff" : "#64748b",
      }}
    >
      {label}
    </button>
  )
}

export default function IssuesPage() {
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState("")
  const [priority, setPriority] = useState("")
  const [page, setPage] = useState(1)

  const { activeProjectId } = useActiveProject()

  const { data, isLoading } = useIssues({
    category: category || undefined,
    status: status || undefined,
    priority: priority || undefined,
    page,
    projectId: activeProjectId,
  })

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-[400px] rounded-2xl" />
      </div>
    )
  }

  const counts = data?.counts ?? { critical: 0, warnings: 0, total: 0 }
  const items = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{ background: "#ef444415" }}
        >
          <Bug className="h-5 w-5" style={{ color: "#ef4444" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Problemes & Erreurs
          </h1>
          <p className="text-sm text-slate-400">
            Vue consolidee de tous les problemes detectes sur vos audits
          </p>
        </div>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#ef444415" }}
            >
              <span className="text-lg font-bold" style={{ color: "#ef4444" }}>
                !
              </span>
            </div>
            <div>
              <p
                className="text-2xl font-bold tabular-nums"
                style={{ color: "#ef4444" }}
              >
                {counts.critical}
              </p>
              <p className="text-xs text-slate-400 font-medium">Critiques</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#f59e0b15" }}
            >
              <span className="text-lg font-bold" style={{ color: "#f59e0b" }}>
                ~
              </span>
            </div>
            <div>
              <p
                className="text-2xl font-bold tabular-nums"
                style={{ color: "#f59e0b" }}
              >
                {counts.warnings}
              </p>
              <p className="text-xs text-slate-400 font-medium">
                Avertissements
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#2563eb15" }}
            >
              <span className="text-lg font-bold" style={{ color: "#2563eb" }}>
                #
              </span>
            </div>
            <div>
              <p
                className="text-2xl font-bold tabular-nums"
                style={{ color: "#2563eb" }}
              >
                {counts.total}
              </p>
              <p className="text-xs text-slate-400 font-medium">Total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card className="border border-slate-100 rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Filtres
            </span>
          </div>
          <div className="flex flex-wrap gap-6">
            {/* Categorie */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-400">
                Categorie
              </p>
              <div className="flex gap-1">
                {CATEGORIES.map((c) => (
                  <FilterButton
                    key={c.value}
                    label={c.label}
                    active={category === c.value}
                    onClick={() => {
                      setCategory(c.value)
                      setPage(1)
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Statut */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-400">Statut</p>
              <div className="flex gap-1">
                {STATUSES.map((s) => (
                  <FilterButton
                    key={s.value}
                    label={s.label}
                    active={status === s.value}
                    onClick={() => {
                      setStatus(s.value)
                      setPage(1)
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Priorite */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-400">
                Priorite
              </p>
              <div className="flex gap-1">
                {PRIORITIES.map((p) => (
                  <FilterButton
                    key={p.value}
                    label={p.label}
                    active={priority === p.value}
                    onClick={() => {
                      setPriority(p.value)
                      setPage(1)
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card className="border border-slate-100 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {data?.total ?? 0} probleme{(data?.total ?? 0) > 1 ? "s" : ""}{" "}
            detecte{(data?.total ?? 0) > 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-12">
              <Bug className="h-10 w-10 mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">
                Aucun probleme trouve avec ces filtres.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Check
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Categorie
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Priorite
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      URL page
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Audit
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((issue: IssueItem) => (
                    <tr
                      key={issue.id}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                        {issue.checkName.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold border-0 px-2 py-0.5"
                          style={{
                            background: `${CATEGORY_COLORS[issue.category] ?? "#64748b"}15`,
                            color:
                              CATEGORY_COLORS[issue.category] ?? "#64748b",
                          }}
                        >
                          {CATEGORY_LABELS[issue.category] ?? issue.category}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-bold border-0 px-2 py-0.5"
                          style={{
                            background:
                              issue.status === "FAIL"
                                ? "#ef444420"
                                : "#f59e0b20",
                            color:
                              issue.status === "FAIL"
                                ? "#ef4444"
                                : "#f59e0b",
                          }}
                        >
                          {issue.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-500">
                        {PRIORITY_LABELS[issue.priority] ?? issue.priority}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px]">
                        <p
                          className="text-xs text-blue-600 truncate"
                          title={issue.page.url}
                        >
                          {issue.page.url}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-500 whitespace-nowrap">
                        {issue.page.audit.project.name}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-500 max-w-[250px]">
                        <p className="truncate" title={issue.message}>
                          {issue.message}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Page {page} sur {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Precedent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-xs"
                >
                  Suivant
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
