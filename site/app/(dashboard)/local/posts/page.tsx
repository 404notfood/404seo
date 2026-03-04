"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { FileText, Eye, MousePointerClick } from "lucide-react"
import { useLocalListings, useLocalPosts } from "@/hooks/useLocal"

const POST_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  UPDATE: { label: "Actualité", color: "#2563eb" },
  EVENT: { label: "Événement", color: "#7c3aed" },
  OFFER: { label: "Offre", color: "#10b981" },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Brouillon", color: "#64748b" },
  SCHEDULED: { label: "Programmé", color: "#f59e0b" },
  PUBLISHED: { label: "Publié", color: "#10b981" },
}

export default function PostsPage() {
  const { data: listings, isLoading: listingsLoading } = useLocalListings()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listingId = selectedId ?? listings?.[0]?.id ?? null
  const { data, isLoading: postsLoading } = useLocalPosts(listingId)

  const isLoading = listingsLoading || (!!listingId && postsLoading)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    )
  }

  const posts = data?.posts ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
          <FileText className="h-6 w-6" style={{ color: "#06b6d4" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Posts Google</h1>
          <p className="text-sm text-slate-500">Gérez vos publications Google Business Profile</p>
        </div>
      </div>

      {/* Listing selector */}
      {listings && listings.length > 1 && (
        <select
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
          value={listingId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>{l.businessName}</option>
          ))}
        </select>
      )}

      {posts.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <FileText className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucun post Google</p>
            <p className="text-sm mt-1">Créez des posts pour engager votre audience locale.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const typeConf = POST_TYPE_LABELS[post.type] ?? POST_TYPE_LABELS.UPDATE
            const statusConf = STATUS_LABELS[post.status] ?? STATUS_LABELS.DRAFT

            return (
              <Card key={post.id} className="border-slate-100 rounded-2xl shadow-sm">
                <CardContent className="py-4 px-5 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge style={{ background: `${typeConf.color}15`, color: typeConf.color }} className="text-[10px]">
                      {typeConf.label}
                    </Badge>
                    <Badge style={{ background: `${statusConf.color}15`, color: statusConf.color }} className="text-[10px]">
                      {statusConf.label}
                    </Badge>
                    <span className="text-[11px] text-slate-400 ml-auto">
                      {new Date(post.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed">
                    {post.content.length > 200 ? post.content.slice(0, 200) + "…" : post.content}
                  </p>

                  {post.ctaType && (
                    <div className="flex items-center gap-2 text-xs text-blue-600">
                      <span className="font-medium">CTA : {post.ctaType}</span>
                      {post.ctaUrl && <span className="text-slate-400 truncate">{post.ctaUrl}</span>}
                    </div>
                  )}

                  {post.status === "PUBLISHED" && (
                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> {post.views} vues
                      </span>
                      <span className="flex items-center gap-1">
                        <MousePointerClick className="h-3.5 w-3.5" /> {post.clicks} clics
                      </span>
                    </div>
                  )}

                  {post.scheduledAt && post.status === "SCHEDULED" && (
                    <p className="text-xs text-slate-400">
                      Programmé le {new Date(post.scheduledAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
