"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  MapPin, Star, MessageSquare, FileText, Store, BarChart3,
  TrendingUp, CheckCircle2, ArrowRight, Zap, Shield, Globe
} from "lucide-react"
import { useLocalDashboard } from "@/hooks/useLocal"
import { useGoogleStatus } from "@/hooks/useGoogle"
import { apiClient } from "@/lib/api-client"
import Link from "next/link"

function completionColor(score: number) {
  return score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
}

export default function LocalDashboardPage() {
  const { data, isLoading } = useLocalDashboard()
  const { data: googleStatus } = useGoogleStatus()

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-[280px] rounded-2xl" />
      </div>
    )
  }

  const listings = data?.listings ?? []
  const avgRating = data?.avgRating ?? 0
  const totalReviews = data?.totalReviews ?? 0
  const pendingReplies = data?.pendingReplies ?? 0
  const postsThisMonth = data?.postsThisMonth ?? 0

  return (
    <div className="p-6 space-y-6">

      {/* Hero banner */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #1e3a5f 100%)" }}
      >
        {/* Background decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 h-48 w-48 opacity-10" style={{ background: "radial-gradient(circle at top right, #3b82f6, transparent)" }} />
          <div className="absolute bottom-0 left-0 h-32 w-32 opacity-5" style={{ background: "radial-gradient(circle, #06b6d4, transparent)" }} />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "24px 24px"
          }} />
        </div>

        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                <MapPin className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">SEO Local</h1>
                <p className="text-sm text-blue-300 mt-0.5">
                  {listings.length > 0
                    ? `${listings.length} établissement${listings.length > 1 ? "s" : ""} · ${totalReviews} avis`
                    : "Gérez votre présence locale sur Google"
                  }
                </p>
              </div>
            </div>

            {!googleStatus?.connected ? (
              <Button
                onClick={() => apiClient.connectGoogle()}
                className="gap-2 text-sm font-medium shrink-0"
                style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)", backdropFilter: "blur(8px)" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connecter avec Google
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Google connecté — {googleStatus.email}</span>
              </div>
            )}
          </div>

          {/* KPI inline */}
          {listings.length > 0 && (
            <div className="flex items-center gap-6 mt-5 pt-4 border-t border-white/10">
              <div>
                <p className="text-xl font-bold text-white">{listings.length}</p>
                <p className="text-[11px] text-blue-300">Établissements</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="text-xl font-bold text-white flex items-center gap-1">
                  {avgRating > 0 ? avgRating.toFixed(1) : "—"}
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                </p>
                <p className="text-[11px] text-blue-300">Note moyenne</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="text-xl font-bold text-white">{totalReviews}</p>
                <p className="text-[11px] text-blue-300">Avis total</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="text-xl font-bold" style={{ color: pendingReplies > 0 ? "#fbbf24" : "white" }}>
                  {pendingReplies}
                </p>
                <p className="text-[11px] text-blue-300">Sans réponse</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Fiches actives",
            value: listings.length,
            icon: Store,
            color: "#2563eb",
            bg: "#eff6ff",
            href: "/local/gbp",
          },
          {
            label: "Note moyenne",
            value: avgRating > 0 ? `${avgRating.toFixed(1)} ★` : "—",
            icon: Star,
            color: "#f59e0b",
            bg: "#fefce8",
            sub: `${totalReviews} avis`,
          },
          {
            label: "Avis sans réponse",
            value: pendingReplies,
            icon: MessageSquare,
            color: pendingReplies > 0 ? "#ef4444" : "#10b981",
            bg: pendingReplies > 0 ? "#fef2f2" : "#f0fdf4",
            href: "/local/reviews",
          },
          {
            label: "Posts ce mois",
            value: postsThisMonth,
            icon: FileText,
            color: "#06b6d4",
            bg: "#ecfeff",
            href: "/local/posts",
          },
        ].map((kpi) => (
          kpi.href ? (
            <Link key={kpi.label} href={kpi.href}>
              <Card className="border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer group h-full">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110" style={{ background: kpi.bg }}>
                      <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
                      <p className="text-xs text-slate-500">{kpi.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Card key={kpi.label} className="border-slate-100 rounded-2xl shadow-sm h-full">
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: kpi.bg }}>
                    <kpi.icon className="h-5 w-5" style={{ color: kpi.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
                    <p className="text-xs text-slate-500">{kpi.label}</p>
                    {kpi.sub && <p className="text-[11px] text-slate-400">{kpi.sub}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        ))}
      </div>

      {/* Listings list or empty state */}
      {listings.length === 0 ? (
        /* Empty state premium */
        <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
          {/* Dark top */}
          <div className="p-6 text-center" style={{ background: "linear-gradient(135deg, #0f172a, #1e3a5f)" }}>
            <div className="h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}>
              <MapPin className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Démarrez votre SEO local</h3>
            <p className="text-sm text-blue-200 max-w-sm mx-auto mb-4">
              Connectez votre compte Google Business Profile pour importer vos fiches et commencer à optimiser votre visibilité locale.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {!googleStatus?.connected && (
                <Button onClick={() => apiClient.connectGoogle()} className="gap-2" style={{ background: "white", color: "#0f172a" }}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Connecter avec Google
                </Button>
              )}
              <Link href="/local/gbp">
                <Button variant="ghost" className="gap-1.5 text-blue-200 hover:text-white hover:bg-white/10">
                  Créer manuellement
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {[
              { icon: Shield, color: "#10b981", bg: "#f0fdf4", title: "Fiches vérifiées", desc: "Gérez le statut de vérification et la complétion de vos fiches." },
              { icon: Star, color: "#f59e0b", bg: "#fefce8", title: "Gestion des avis", desc: "Répondez aux avis et améliorez votre note moyenne." },
              { icon: BarChart3, color: "#7c3aed", bg: "#faf5ff", title: "Rankings Google Maps", desc: "Suivez vos positions dans le pack local et Maps." },
            ].map((f) => (
              <div key={f.title} className="p-5 flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: f.bg }}>
                  <f.icon className="h-4.5 w-4.5 h-[18px] w-[18px]" style={{ color: f.color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{f.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Listing cards */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Vos établissements</h2>
            <Link href="/local/gbp">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-slate-500 hover:text-blue-600">
                Voir tout
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
          {listings.map((listing) => {
            const score = listing.completionScore
            const color = completionColor(score)
            return (
              <Link key={listing.id} href="/local/gbp">
                <Card className="border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden">
                  {/* Score accent */}
                  <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
                  <CardContent className="py-3.5 px-5">
                    <div className="flex items-center gap-4">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
                        style={{ background: "linear-gradient(135deg, #1e3a5f, #2563eb)" }}
                      >
                        {listing.businessName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 text-sm">{listing.businessName}</span>
                          {listing.isVerified && (
                            <Badge className="text-[9px] px-1.5" style={{ background: "#10b98115", color: "#10b981", border: "1px solid #10b98130" }}>
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                              Vérifié
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{listing.category} · {listing.address}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold" style={{ color }}>{score}%</p>
                        <p className="text-[10px] text-slate-400">complétion</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* Modules de navigation */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            href: "/local/gbp",
            label: "Fiches GBP",
            desc: "Gérer les établissements",
            icon: Store,
            color: "#2563eb",
            bg: "linear-gradient(135deg, #eff6ff, #dbeafe)",
          },
          {
            href: "/local/reviews",
            label: "Avis clients",
            desc: `${pendingReplies > 0 ? `${pendingReplies} en attente` : "À jour"}`,
            icon: Star,
            color: "#f59e0b",
            bg: "linear-gradient(135deg, #fefce8, #fef9c3)",
            alert: pendingReplies > 0,
          },
          {
            href: "/local/posts",
            label: "Posts Google",
            desc: `${postsThisMonth} ce mois`,
            icon: FileText,
            color: "#06b6d4",
            bg: "linear-gradient(135deg, #ecfeff, #cffafe)",
          },
          {
            href: "/local/rankings",
            label: "Rankings Maps",
            desc: "Positions locales",
            icon: TrendingUp,
            color: "#7c3aed",
            bg: "linear-gradient(135deg, #faf5ff, #ede9fe)",
          },
        ].map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="border-slate-100 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer h-full group overflow-hidden">
              <CardContent className="py-4 px-4">
                <div className="flex items-start gap-3">
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                    style={{ background: link.bg }}
                  >
                    <link.icon className="h-4.5 w-4.5 h-[18px] w-[18px]" style={{ color: link.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-700">{link.label}</p>
                      {link.alert && (
                        <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{link.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
