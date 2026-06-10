"use client"

import { use, useMemo, useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, ExternalLink, Link2, LinkIcon, Search } from "lucide-react"
import { useAudit } from "@/hooks/useAudits"
import { groupLinksByDomain, type LinkKind } from "@/components/audit/LinksDialog"

interface Props {
  params: Promise<{ id: string }>
}

function LinksPageInner({ id }: { id: string }) {
  const { data: audit, isLoading } = useAudit(id)
  const searchParams = useSearchParams()
  const initialKind: LinkKind = searchParams.get("type") === "internal" ? "internal" : "external"

  const [kind, setKind] = useState<LinkKind>(initialKind)
  const [query, setQuery] = useState("")

  // Agrège et déduplique les URLs de toutes les pages crawlées.
  const { external, internal } = useMemo(() => {
    const ext = new Set<string>()
    const int = new Set<string>()
    for (const page of audit?.pages ?? []) {
      for (const u of page.externalLinkUrls ?? []) ext.add(u)
      for (const u of page.internalLinkUrls ?? []) int.add(u)
    }
    return { external: Array.from(ext), internal: Array.from(int) }
  }, [audit?.pages])

  const urls = kind === "external" ? external : internal

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return urls
    return urls.filter((u) => u.toLowerCase().includes(q))
  }, [urls, query])

  const grouped = useMemo(() => groupLinksByDomain(filtered), [filtered])

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!audit) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Audit introuvable.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/audits">Retour aux audits</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-500 mb-1">
          <Link href={`/audits/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Retour à l&apos;audit
          </Link>
        </Button>
        <h1 className="text-xl font-bold text-slate-900">Liens détectés</h1>
        <p className="text-sm text-slate-400 mt-0.5 truncate">{audit.url}</p>
      </div>

      {/* Toggle externe / interne */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setKind("external")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            kind === "external" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Link2 className="h-4 w-4" />
          Externes <span className="opacity-70">({external.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setKind("internal")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            kind === "internal" ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <LinkIcon className="h-4 w-4" />
          Internes <span className="opacity-70">({internal.length})</span>
        </button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {kind === "external" ? "Liens externes" : "Liens internes"}{" "}
            <span className="text-sm font-normal text-slate-400">
              ({grouped.length} domaine{grouped.length > 1 ? "s" : ""}, {filtered.length} lien{filtered.length > 1 ? "s" : ""})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer par URL ou domaine…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          </div>

          {urls.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Aucun lien {kind === "external" ? "externe" : "interne"} détecté.
              <br />
              <span className="text-xs text-slate-400">
                (Les liens ne sont enregistrés que pour les audits lancés après cette mise à jour.)
              </span>
            </p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Aucun résultat pour « {query} ».</p>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ domain, links }) => (
                <div key={domain}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-slate-700 truncate">{domain}</span>
                    <span className="text-[11px] text-slate-400">{links.length} lien{links.length > 1 ? "s" : ""}</span>
                  </div>
                  <ul className="space-y-1 pl-1">
                    {links.map((url) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="group flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          <span className="break-all">{url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuditLinksPage({ params }: Props) {
  const { id } = use(params)
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-64" /></div>}>
      <LinksPageInner id={id} />
    </Suspense>
  )
}
