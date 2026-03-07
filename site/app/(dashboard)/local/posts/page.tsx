"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { FileText, Eye, MousePointerClick, Plus, X, Loader2, Calendar } from "lucide-react"
import { useLocalListings, useLocalPosts, useCreatePost } from "@/hooks/useLocal"

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

const CTA_TYPES = ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"] as const

function CreatePostForm({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const { mutate: createPost, isPending } = useCreatePost(listingId)
  const [form, setForm] = useState({
    content: "",
    type: "UPDATE" as "UPDATE" | "EVENT" | "OFFER",
    ctaType: "",
    ctaUrl: "",
    scheduledAt: "",
  })

  const charCount = form.content.length
  const maxChars = 1500

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.content.trim()) return
    createPost(
      {
        content: form.content,
        type: form.type,
        ctaType: form.ctaType || undefined,
        ctaUrl: form.ctaUrl || undefined,
        scheduledAt: form.scheduledAt || undefined,
      },
      { onSuccess: onClose }
    )
  }

  return (
    <Card className="border-blue-100 rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-500" />
            Nouveau post Google
          </CardTitle>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="flex gap-2">
            {(["UPDATE", "EVENT", "OFFER"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  form.type === t
                    ? "font-semibold"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
                style={form.type === t ? {
                  background: `${POST_TYPE_LABELS[t].color}15`,
                  color: POST_TYPE_LABELS[t].color,
                  borderColor: `${POST_TYPE_LABELS[t].color}40`,
                } : {}}
              >
                {POST_TYPE_LABELS[t].label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value.slice(0, maxChars) })}
              placeholder="Rédigez votre post Google Business Profile…"
              rows={5}
              className="w-full text-sm border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              required
            />
            <div className="flex justify-end mt-1">
              <span className={`text-[11px] ${charCount > maxChars * 0.9 ? "text-amber-500" : "text-slate-400"}`}>
                {charCount}/{maxChars}
              </span>
            </div>
          </div>

          {/* CTA optionnel */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Bouton d&apos;action (optionnel)</label>
              <select
                value={form.ctaType}
                onChange={(e) => setForm({ ...form, ctaType: e.target.value })}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="">Aucun</option>
                {CTA_TYPES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            {form.ctaType && (
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">URL du bouton</label>
                <Input
                  value={form.ctaUrl}
                  onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
                  placeholder="https://exemple.com"
                  type="url"
                  className="border-slate-200 text-sm"
                />
              </div>
            )}
          </div>

          {/* Programmation */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Programmer (optionnel — laisser vide pour publier maintenant)
            </label>
            <Input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
              className="border-slate-200 text-sm"
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={isPending || !form.content.trim()}
              className="btn-glow gap-1.5"
              style={{ background: "#06b6d4" }}
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" />Publication…</>
                : form.scheduledAt
                  ? <><Calendar className="h-4 w-4" />Programmer</>
                  : <><FileText className="h-4 w-4" />Publier maintenant</>
              }
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="text-slate-500">
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default function PostsPage() {
  const { data: listings, isLoading: listingsLoading } = useLocalListings()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const listingId = selectedId ?? listings?.[0]?.id ?? null
  const { data, isLoading: postsLoading } = useLocalPosts(listingId)

  const isLoading = listingsLoading || (!!listingId && postsLoading)

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    )
  }

  const posts = data?.posts ?? []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
            <FileText className="h-6 w-6" style={{ color: "#06b6d4" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Posts Google</h1>
            <p className="text-sm text-slate-500">{posts.length} publication{posts.length > 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          {listingId && (
            <Button
              onClick={() => setShowCreate(!showCreate)}
              className="gap-1.5 btn-glow"
              style={{ background: "#06b6d4" }}
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Nouveau post
            </Button>
          )}
        </div>
      </div>

      {/* Formulaire de création */}
      {showCreate && listingId && (
        <CreatePostForm listingId={listingId} onClose={() => setShowCreate(false)} />
      )}

      {/* Stats rapides */}
      {posts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Publiés", value: posts.filter((p) => p.status === "PUBLISHED").length, color: "#10b981" },
            { label: "Programmés", value: posts.filter((p) => p.status === "SCHEDULED").length, color: "#f59e0b" },
            { label: "Brouillons", value: posts.filter((p) => p.status === "DRAFT").length, color: "#64748b" },
          ].map((s) => (
            <Card key={s.label} className="border-slate-100 rounded-2xl shadow-sm">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Posts list */}
      {posts.length === 0 && !showCreate ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <FileText className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucun post Google</p>
            <p className="text-sm mt-1">Créez votre premier post pour engager votre audience locale.</p>
            {listingId && (
              <Button
                onClick={() => setShowCreate(true)}
                className="mt-4 gap-1.5 btn-glow"
                style={{ background: "#06b6d4" }}
              >
                <Plus className="h-4 w-4" />
                Créer un post
              </Button>
            )}
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
                    <Badge style={{ background: `${typeConf.color}15`, color: typeConf.color, border: `1px solid ${typeConf.color}30` }} className="text-[10px]">
                      {typeConf.label}
                    </Badge>
                    <Badge style={{ background: `${statusConf.color}15`, color: statusConf.color, border: `1px solid ${statusConf.color}30` }} className="text-[10px]">
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
                      <span className="font-medium">CTA : {post.ctaType.replace("_", " ")}</span>
                      {post.ctaUrl && <span className="text-slate-400 truncate">{post.ctaUrl}</span>}
                    </div>
                  )}

                  {post.status === "PUBLISHED" && (
                    <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5 text-slate-300" />
                        <span className="font-semibold text-slate-700">{post.views}</span> vues
                      </span>
                      <span className="flex items-center gap-1">
                        <MousePointerClick className="h-3.5 w-3.5 text-slate-300" />
                        <span className="font-semibold text-slate-700">{post.clicks}</span> clics
                      </span>
                    </div>
                  )}

                  {post.scheduledAt && post.status === "SCHEDULED" && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
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
