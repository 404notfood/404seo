"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Star, MessageSquare, Sparkles, Send, Loader2, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react"
import { useLocalListings, useLocalReviews, useReplyToReview, useAISuggestReply } from "@/hooks/useLocal"
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

function ReviewCard({ review, listingId }: {
  review: {
    id: string
    authorName: string
    rating: number
    text: string | null
    replyText: string | null
    replyStatus: "PENDING" | "REPLIED" | "IGNORED"
    sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | null
    aiSuggestedReply: string | null
    publishedAt: string
  }
  listingId: string
}) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyText, setReplyText] = useState(review.replyText ?? "")
  const { mutate: reply, isPending: isReplying } = useReplyToReview(listingId)
  const { mutate: aiSuggest, isPending: isSuggesting } = useAISuggestReply(listingId)

  function handleAISuggest() {
    aiSuggest(review.id, {
      onSuccess: (data) => setReplyText(data.suggestion),
    })
  }

  function handleReply() {
    if (!replyText.trim()) return
    reply({ reviewId: review.id, replyText }, {
      onSuccess: () => setShowReplyForm(false),
    })
  }

  const statusStyle = {
    REPLIED: { bg: "#10b98115", color: "#10b981", label: "Répondu" },
    IGNORED: { bg: "#64748b15", color: "#64748b", label: "Ignoré" },
    PENDING: { bg: "#ef444415", color: "#ef4444", label: "En attente" },
  }[review.replyStatus]

  const sentimentStyle = review.sentiment ? {
    POSITIVE: { bg: "#10b98115", color: "#10b981", label: "Positif" },
    NEUTRAL: { bg: "#64748b15", color: "#64748b", label: "Neutre" },
    NEGATIVE: { bg: "#ef444415", color: "#ef4444", label: "Négatif" },
  }[review.sentiment] : null

  return (
    <Card className="border-slate-100 rounded-2xl shadow-sm">
      <CardContent className="py-4 px-5 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #1e3a5f, #2563eb)" }}>
              {review.authorName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <span className="font-semibold text-sm text-slate-800">{review.authorName}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <StarRating rating={review.rating} />
                <span className="text-[11px] text-slate-400">
                  {new Date(review.publishedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {sentimentStyle && (
              <Badge className="text-[10px]" style={{ background: sentimentStyle.bg, color: sentimentStyle.color }}>
                {sentimentStyle.label}
              </Badge>
            )}
            <Badge className="text-[10px]" style={{ background: statusStyle.bg, color: statusStyle.color }}>
              {statusStyle.label}
            </Badge>
          </div>
        </div>

        {/* Texte avis */}
        {review.text && <p className="text-sm text-slate-600 leading-relaxed">{review.text}</p>}

        {/* Réponse existante */}
        {review.replyText && (
          <div className="pl-4 border-l-2 border-blue-200 bg-blue-50/30 rounded-r-lg p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Votre réponse
            </p>
            <p className="text-sm text-slate-600">{review.replyText}</p>
          </div>
        )}

        {/* Suggestion IA (si pas encore répondu) */}
        {review.aiSuggestedReply && review.replyStatus === "PENDING" && (
          <div className="pl-4 border-l-2 border-cyan-300 bg-cyan-50/50 rounded-r-lg p-3">
            <p className="text-xs font-semibold text-cyan-600 mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Suggestion IA
            </p>
            <p className="text-sm text-slate-600">{review.aiSuggestedReply}</p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 h-7 text-xs text-cyan-600 hover:text-cyan-800 hover:bg-cyan-100 p-1"
              onClick={() => { setReplyText(review.aiSuggestedReply!); setShowReplyForm(true) }}
            >
              Utiliser cette réponse
            </Button>
          </div>
        )}

        {/* Actions */}
        {review.replyStatus !== "REPLIED" && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-slate-500 hover:text-blue-600"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Répondre
              {showReplyForm ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
            {!review.aiSuggestedReply && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-slate-500 hover:text-cyan-600"
                onClick={handleAISuggest}
                disabled={isSuggesting}
              >
                {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Suggestion IA
              </Button>
            )}
          </div>
        )}

        {/* Formulaire de réponse */}
        {showReplyForm && (
          <div className="space-y-2 pt-1">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Rédigez votre réponse…"
              rows={3}
              className="w-full text-sm border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={isReplying || !replyText.trim()}
                onClick={handleReply}
                className="gap-1.5 btn-glow text-xs"
                style={{ background: "#2563eb" }}
              >
                {isReplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Publier la réponse
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-slate-400" onClick={() => setShowReplyForm(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
  const pending = reviews.filter((r) => r.replyStatus === "PENDING").length

  const distData = [5, 4, 3, 2, 1].map((n) => ({
    stars: `${n}★`,
    count: Number(stats.distribution[String(n)] ?? 0),
  }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "rgba(245,158,11,0.1)" }}>
            <Star className="h-6 w-6" style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Avis Google</h1>
            <p className="text-sm text-slate-500">
              {pending > 0
                ? <span className="text-red-500 font-medium">{pending} avis en attente de réponse</span>
                : "Tous les avis ont reçu une réponse"
              }
            </p>
          </div>
        </div>
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold" style={{ color: "#f59e0b" }}>{stats.avgRating}</p>
            <div className="flex justify-center mt-1"><StarRating rating={Math.round(stats.avgRating)} /></div>
            <p className="text-xs text-slate-500 mt-1">Note moyenne</p>
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5 text-center">
            <p className="text-3xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-xs text-slate-500 mt-1">Total avis</p>
            {pending > 0 && (
              <p className="text-xs font-medium mt-1" style={{ color: "#ef4444" }}>{pending} sans réponse</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5">
            <div className="h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={distData}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="stars" type="category" width={30} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => (typeof value === "number" ? value : 0)} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending first */}
      {reviews.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucun avis pour cette fiche.</p>
            <p className="text-sm mt-1">Les avis importés depuis Google Business Profile apparaîtront ici.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* En attente en premier */}
          {[...reviews].sort((a, b) => {
            const order = { PENDING: 0, IGNORED: 1, REPLIED: 2 }
            return order[a.replyStatus] - order[b.replyStatus]
          }).map((review) => (
            <ReviewCard key={review.id} review={review} listingId={listingId!} />
          ))}
        </div>
      )}
    </div>
  )
}
