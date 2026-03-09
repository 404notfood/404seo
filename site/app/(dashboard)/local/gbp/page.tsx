"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Store, MapPin, Phone, Globe, Clock, CheckCircle2, Plus, X,
  Link2, Star, MessageSquare, FileText, TrendingUp, ExternalLink,
  Settings, BarChart3, Shield, Zap
} from "lucide-react"
import { useLocalListings, useCreateListing } from "@/hooks/useLocal"
import { useGoogleStatus } from "@/hooks/useGoogle"
import { apiClient } from "@/lib/api-client"
import { toast } from "sonner"
import Link from "next/link"

function completionColor(score: number) {
  return score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
}

function completionLabel(score: number) {
  return score >= 80 ? "Excellent" : score >= 50 ? "À améliorer" : "Incomplet"
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-3.5 w-3.5"
          style={{
            fill: i <= Math.round(rating) ? "#f59e0b" : "transparent",
            color: i <= Math.round(rating) ? "#f59e0b" : "#cbd5e1",
          }}
        />
      ))}
      <span className="text-xs font-semibold text-slate-700 ml-1">{rating > 0 ? rating.toFixed(1) : "—"}</span>
    </div>
  )
}

function CreateListingDialog({ onClose }: { onClose: () => void }) {
  const { mutate: createListing, isPending } = useCreateListing()
  const [form, setForm] = useState({
    businessName: "",
    category: "",
    address: "",
    phone: "",
    website: "",
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createListing(
      {
        businessName: form.businessName,
        category: form.category,
        address: form.address,
        phone: form.phone || undefined,
        website: form.website || undefined,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(37,99,235,0.1)" }}>
              <Store className="h-4 w-4" style={{ color: "#2563eb" }} />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Ajouter une fiche GBP</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="businessName" className="text-xs font-medium text-slate-700">
              Nom de l&apos;établissement <span className="text-red-500">*</span>
            </Label>
            <Input id="businessName" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Mon Restaurant" required className="border-slate-200" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category" className="text-xs font-medium text-slate-700">
              Catégorie <span className="text-red-500">*</span>
            </Label>
            <Input id="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Restaurant, Boulangerie, Plombier…" required className="border-slate-200" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-xs font-medium text-slate-700">
              Adresse <span className="text-red-500">*</span>
            </Label>
            <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="12 Rue de la Paix, 75001 Paris" required className="border-slate-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-medium text-slate-700">Téléphone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 1 23 45 67 89" className="border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website" className="text-xs font-medium text-slate-700">Site web</Label>
              <Input id="website" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://exemple.com" className="border-slate-200" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isPending} className="flex-1 btn-glow" style={{ background: "#2563eb" }}>
              {isPending ? "Création…" : "Créer la fiche"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ListingCard({ listing }: { listing: NonNullable<ReturnType<typeof useLocalListings>["data"]>[number] }) {
  const score = listing.completionScore
  const color = completionColor(score)

  return (
    <Card className="border-slate-100 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden group">
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />

      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm"
              style={{ background: "linear-gradient(135deg, #1e3a5f, #2563eb)" }}
            >
              {listing.businessName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-900 text-sm">{listing.businessName}</h3>
                {listing.isVerified && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Vérifié
                  </span>
                )}
                {listing.isGoogleConnected && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "#4285F410", color: "#4285F4", border: "1px solid #4285F430" }}>
                    <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Google
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{listing.category}</p>
            </div>
          </div>
          <Badge
            className="text-[10px] shrink-0"
            style={{
              background: listing.status === "ACTIVE" ? "#10b98115" : "#ef444415",
              color: listing.status === "ACTIVE" ? "#10b981" : "#ef4444",
              border: `1px solid ${listing.status === "ACTIVE" ? "#10b98130" : "#ef444430"}`,
            }}
          >
            {listing.status === "ACTIVE" ? "Actif" : listing.status}
          </Badge>
        </div>

        {/* Infos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            <span className="truncate">{listing.address}</span>
          </div>
          {listing.phone && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Phone className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              {listing.phone}
            </div>
          )}
          {listing.website && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Globe className="h-3.5 w-3.5 text-slate-300 shrink-0" />
              <a href={listing.website} target="_blank" rel="noopener noreferrer" className="truncate hover:text-blue-600 flex items-center gap-1">
                {listing.website.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            <span className="truncate">{listing.category}</span>
          </div>
        </div>

        {/* Completion score */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600">Score de complétion</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold" style={{ color }}>{score}%</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${color}15`, color }}>
                {completionLabel(score)}
              </span>
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-2 rounded-full transition-all duration-700"
              style={{ width: `${score}%`, background: `linear-gradient(90deg, ${color}, ${color}cc)` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MessageSquare className="h-3.5 w-3.5 text-slate-300" />
              <span className="font-semibold text-slate-700">{listing._count.reviews}</span>
              <span>avis</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <FileText className="h-3.5 w-3.5 text-slate-300" />
              <span className="font-semibold text-slate-700">{listing._count.posts}</span>
              <span>posts</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <TrendingUp className="h-3.5 w-3.5 text-slate-300" />
              <span className="font-semibold text-slate-700">{listing._count.rankings}</span>
              <span>mots-clés</span>
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link href={`/local/reviews`}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600" title="Avis">
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href={`/local/posts`}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-cyan-600" title="Posts">
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href={`/local/rankings`}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-purple-600" title="Rankings">
                <BarChart3 className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function GBPListingsPageInner() {
  const { data: listings, isLoading } = useLocalListings()
  const { data: googleStatus } = useGoogleStatus()
  const [showCreate, setShowCreate] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get("google") === "connected") {
      toast.success("Compte Google connecté ! Vos fiches ont été importées.")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [searchParams])

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  const items = listings ?? []
  const avgScore = items.length > 0 ? Math.round(items.reduce((s, l) => s + l.completionScore, 0) / items.length) : 0
  const verified = items.filter((l) => l.isVerified).length
  const googleConnected = items.filter((l) => l.isGoogleConnected).length

  return (
    <div className="p-6 space-y-6">
      {showCreate && <CreateListingDialog onClose={() => setShowCreate(false)} />}

      {/* Hero header */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1d4ed8 100%)" }}
      >
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #60a5fa, transparent)" }} />
          <div className="absolute bottom-0 left-20 h-24 w-24 rounded-full opacity-5" style={{ background: "radial-gradient(circle, #06b6d4, transparent)" }} />
        </div>

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
              <Store className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Google Business Profile</h1>
              <p className="text-sm text-blue-200 mt-0.5">
                {items.length > 0
                  ? `${items.length} fiche${items.length > 1 ? "s" : ""} · Score moyen ${avgScore}%`
                  : "Gérez et optimisez vos fiches d'établissement"
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!googleStatus?.connected ? (
              <Button
                onClick={() => apiClient.connectGoogle()}
                className="gap-2 text-sm font-medium text-white border-white/30 hover:bg-white/20"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(8px)" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Connecter avec Google
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Google connecté</span>
              </div>
            )}
            <Button
              onClick={() => setShowCreate(true)}
              className="gap-1.5 text-sm font-medium btn-glow"
              style={{ background: "#2563eb" }}
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </div>

        {/* Mini stats */}
        {items.length > 0 && (
          <div className="relative flex items-center gap-6 mt-5 pt-4 border-t border-white/10">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{items.length}</p>
              <p className="text-[11px] text-blue-300">Fiches</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <p className="text-lg font-bold text-white">{avgScore}%</p>
              <p className="text-[11px] text-blue-300">Score moy.</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <p className="text-lg font-bold text-white">{verified}</p>
              <p className="text-[11px] text-blue-300">Vérifiées</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <p className="text-lg font-bold text-white">{googleConnected}</p>
              <p className="text-[11px] text-blue-300">Sync Google</p>
            </div>
          </div>
        )}
      </div>

      {/* Google non connecté — banner */}
      {!googleStatus?.connected && items.length > 0 && (
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "linear-gradient(90deg, #fefce8, #fef9c3)", border: "1px solid #fde68a" }}
        >
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-100 shrink-0">
            <Zap className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Importez vos fiches depuis Google</p>
            <p className="text-xs text-amber-600 mt-0.5">Connectez votre compte Google pour synchroniser automatiquement vos fiches GBP et accéder aux statistiques.</p>
          </div>
          <Button
            size="sm"
            onClick={() => apiClient.connectGoogle()}
            className="shrink-0 gap-1.5 text-xs"
            style={{ background: "#f59e0b", color: "white" }}
          >
            <Link2 className="h-3.5 w-3.5" />
            Connecter
          </Button>
        </div>
      )}

      {/* Listings */}
      {items.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9)", border: "2px dashed #e2e8f0" }}
        >
          <div className="h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0f172a, #1e3a5f)" }}>
            <Store className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">Aucune fiche configurée</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            Importez vos fiches depuis Google Business Profile ou créez-en une manuellement pour commencer.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {!googleStatus?.connected && (
              <Button
                onClick={() => apiClient.connectGoogle()}
                className="gap-2"
                style={{ background: "linear-gradient(135deg, #1e3a5f, #2563eb)", color: "white" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Connecter avec Google
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowCreate(true)} className="gap-1.5 border-slate-200">
              <Plus className="h-4 w-4" />
              Créer manuellement
            </Button>
          </div>

          {/* Feature hints */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 text-left">
            {[
              { icon: Shield, color: "#10b981", title: "Fiches vérifiées", desc: "Suivez le statut de vérification de vos établissements" },
              { icon: Star, color: "#f59e0b", title: "Gestion des avis", desc: "Répondez aux avis clients directement depuis la plateforme" },
              { icon: BarChart3, color: "#2563eb", title: "Rankings locaux", desc: "Suivez vos positions sur Google Maps et la recherche locale" },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${f.color}15` }}>
                  <f.icon className="h-4 w-4" style={{ color: f.color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800">{f.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Quick access */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/local/reviews", label: "Gérer les avis", icon: MessageSquare, color: "#f59e0b", bg: "#fef9c3" },
            { href: "/local/posts", label: "Créer des posts", icon: FileText, color: "#06b6d4", bg: "#ecfeff" },
            { href: "/local/rankings", label: "Rankings Maps", icon: BarChart3, color: "#7c3aed", bg: "#faf5ff" },
            { href: "/settings", label: "Paramètres Google", icon: Settings, color: "#2563eb", bg: "#eff6ff" },
          ].map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer h-full group">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110" style={{ background: link.bg }}>
                    <link.icon className="h-4 w-4" style={{ color: link.color }} />
                  </div>
                  <span className="text-xs font-medium text-slate-700">{link.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GBPListingsPage() {
  return (
    <Suspense fallback={
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}
        </div>
      </div>
    }>
      <GBPListingsPageInner />
    </Suspense>
  )
}
