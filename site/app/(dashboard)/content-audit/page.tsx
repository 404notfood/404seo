"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { PenTool, ChevronLeft, ChevronRight } from "lucide-react"
import { useContentOverview } from "@/hooks/useAggregation"

export default function ContentAuditPage() {
  const [thin, setThin] = useState(false)
  const [noMeta, setNoMeta] = useState(false)
  const [noH1, setNoH1] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useContentOverview({ thin, noMeta, noH1, page })

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] rounded-2xl" />
      </div>
    )
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <PenTool className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit de contenu</h1>
          <p className="text-sm text-slate-500">Analyse du contenu de vos pages</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={thin ? "default" : "outline"}
          size="sm"
          onClick={() => { setThin(!thin); setPage(1) }}
          className="rounded-full"
        >
          Contenu mince (&lt;300 mots)
        </Button>
        <Button
          variant={noMeta ? "default" : "outline"}
          size="sm"
          onClick={() => { setNoMeta(!noMeta); setPage(1) }}
          className="rounded-full"
        >
          Sans meta description
        </Button>
        <Button
          variant={noH1 ? "default" : "outline"}
          size="sm"
          onClick={() => { setNoH1(!noH1); setPage(1) }}
          className="rounded-full"
        >
          Sans H1
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            Aucun contenu à analyser. Lancez un audit pour commencer.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{total} page{total > 1 ? "s" : ""} trouvée{total > 1 ? "s" : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-2 font-semibold text-slate-600">URL</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Mots</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Titre</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">Meta desc</th>
                    <th className="text-center py-3 px-2 font-semibold text-slate-600">H1</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-2">
                        <span className="text-xs text-slate-700 font-mono truncate block max-w-[300px]" title={item.url}>
                          {item.url.length > 50 ? item.url.slice(0, 50) + "…" : item.url}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {item.wordCount != null ? (
                          <Badge variant={item.wordCount < 300 ? "destructive" : "secondary"} className="text-xs">
                            {item.wordCount}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {item.titleLength ? (
                          <span className="text-xs text-slate-600">{item.titleLength} car.</span>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Manquant</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {item.metaDescLength ? (
                          <span className="text-xs text-slate-600">{item.metaDescLength} car.</span>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Manquant</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {item.h1.length > 0 ? (
                          <span className="text-xs text-slate-600">{item.h1.length}</span>
                        ) : (
                          <Badge variant="destructive" className="text-xs">0</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                Page {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
