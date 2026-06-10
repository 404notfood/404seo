"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ExternalLink, Link2, LinkIcon, Search } from "lucide-react"

export type LinkKind = "external" | "internal"

/** Regroupe une liste d'URLs par hostname, trié par nombre de liens décroissant. */
export function groupLinksByDomain(urls: string[]): Array<{ domain: string; links: string[] }> {
  const map = new Map<string, string[]>()
  for (const url of urls) {
    let domain: string
    try {
      domain = new URL(url).hostname
    } catch {
      domain = "(lien invalide)"
    }
    const list = map.get(domain)
    if (list) list.push(url)
    else map.set(domain, [url])
  }
  return Array.from(map.entries())
    .map(([domain, links]) => ({ domain, links }))
    .sort((a, b) => b.links.length - a.links.length)
}

interface LinksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: LinkKind
  urls: string[]
  /** Lien "Voir tout" vers la page dédiée (optionnel). */
  seeAllHref?: string
}

export function LinksDialog({ open, onOpenChange, kind, urls, seeAllHref }: LinksDialogProps) {
  const [query, setQuery] = useState("")

  const isExternal = kind === "external"
  const title = isExternal ? "Liens externes" : "Liens internes"
  const Icon = isExternal ? Link2 : LinkIcon

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return urls
    return urls.filter((u) => u.toLowerCase().includes(q))
  }, [urls, query])

  const grouped = useMemo(() => groupLinksByDomain(filtered), [filtered])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-blue-600" />
            {title}
            <span className="ml-1 text-sm font-normal text-slate-400">({urls.length})</span>
          </DialogTitle>
          <DialogDescription>
            {isExternal
              ? "Liens sortants détectés sur l'ensemble des pages crawlées, regroupés par domaine."
              : "Liens internes détectés sur l'ensemble des pages crawlées."}
          </DialogDescription>
        </DialogHeader>

        {urls.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">Aucun lien détecté.</p>
        ) : (
          <>
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

            {/* Liste groupée par domaine, scrollable */}
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
              {grouped.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Aucun résultat pour « {query} ».</p>
              ) : (
                grouped.map(({ domain, links }) => (
                  <div key={domain}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-slate-700 truncate">{domain}</span>
                      <span className="text-[11px] text-slate-400">{links.length}</span>
                    </div>
                    <ul className="space-y-1">
                      {links.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="group flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-700 hover:underline break-all"
                          >
                            <span className="break-all">{url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>

            {seeAllHref && (
              <div className="pt-1 border-t border-slate-100 flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href={seeAllHref}>Voir tous les liens</Link>
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
