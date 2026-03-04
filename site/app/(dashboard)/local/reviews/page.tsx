"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Star, MessageSquare } from "lucide-react"
import { useLocalListings, useLocalReviews } from "@/hooks/useLocal"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts"

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className="h-3.5 w-3.5"
          style={{ color: s <= rating ? "#f59e0b" : "#e2e8f0" }}
          fill={s <= rating ? "#f59e0b" : "none"}
        />
      ))}
    </div>
  )
}

export default function ReviewsPage() {
  const { data: listings, isLoading: listingsLoading } = useLocalListings()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listingId = selectedId ?? listings?.[0]?.id ?? null
  const { data, isLoading: reviewsLoading } = useLocalReviews(listingId)

  const isLoading = listingsLoading || (!!listingId && reviewsLoading)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[300px] rounded-2xl" />
      </div>
    )
  }

  const reviews = data?.reviews ?? []
  const stats = data?.stats ?? { avgRating: 0, total: 0, distribution: {} }

  const distData = [5, 4, 3, 2, 1].map((n) => ({
    stars: `${n}★`,
    count: Number(stats.distribution[String(n)] ?? 0),
  }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(245,158,11,0.1)" }}>
          <Star className="h-6 w-6" style={{ color: "#f59e0b" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Avis Google</h1>
          <p className="text-sm text-slate-500">Gérez les avis de vos fiches</p>
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold" style={{ color: "#f59e0b" }}>{stats.avgRating}</p>
            <StarRating rating={Math.round(stats.avgRating)} />
            <p className="text-xs text-slate-500 mt-1">Note moyenne</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-xs text-slate-500 mt-1">Total avis</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5">
            <div className="h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={distData}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="stars" type="category" width={30} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number | undefined) => value ?? 0} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            Aucun avis pour cette fiche.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <Card key={review.id} className="border-slate-100 rounded-2xl shadow-sm">
              <CardContent className="py-4 px-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-800">{review.authorName}</span>
                    <StarRating rating={review.rating} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className="text-[10px]"
                      style={{
                        background: review.replyStatus === "REPLIED" ? "#10b98115" : review.replyStatus === "IGNORED" ? "#64748b15" : "#ef444415",
                        color: review.replyStatus === "REPLIED" ? "#10b981" : review.replyStatus === "IGNORED" ? "#64748b" : "#ef4444",
                      }}
                    >
                      {review.replyStatus === "REPLIED" ? "Répondu" : review.replyStatus === "IGNORED" ? "Ignoré" : "En attente"}
                    </Badge>
                    {review.sentiment && (
                      <Badge
                        className="text-[10px]"
                        style={{
                          background: review.sentiment === "POSITIVE" ? "#10b98115" : review.sentiment === "NEGATIVE" ? "#ef444415" : "#64748b15",
                          color: review.sentiment === "POSITIVE" ? "#10b981" : review.sentiment === "NEGATIVE" ? "#ef4444" : "#64748b",
                        }}
                      >
                        {review.sentiment === "POSITIVE" ? "Positif" : review.sentiment === "NEGATIVE" ? "Négatif" : "Neutre"}
                      </Badge>
                    )}
                  </div>
                </div>
                {review.text && <p className="text-sm text-slate-600">{review.text}</p>}
                {review.replyText && (
                  <div className="pl-4 border-l-2 border-blue-200 mt-2">
                    <p className="text-xs text-slate-500 font-medium mb-1">Votre réponse</p>
                    <p className="text-sm text-slate-600">{review.replyText}</p>
                  </div>
                )}
                {review.aiSuggestedReply && review.replyStatus === "PENDING" && (
                  <div className="pl-4 border-l-2 border-cyan-200 mt-2 bg-cyan-50/50 rounded-r-lg p-2">
                    <p className="text-xs font-medium mb-1" style={{ color: "#06b6d4" }}>Suggestion IA</p>
                    <p className="text-sm text-slate-600">{review.aiSuggestedReply}</p>
                  </div>
                )}
                <p className="text-[11px] text-slate-400">
                  {new Date(review.publishedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
