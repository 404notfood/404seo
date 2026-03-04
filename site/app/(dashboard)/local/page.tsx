"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { MapPin, Star, MessageSquare, FileText, Store } from "lucide-react"
import { useLocalDashboard } from "@/hooks/useLocal"
import Link from "next/link"

export default function LocalDashboardPage() {
  const { data, isLoading } = useLocalDashboard()

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[300px] rounded-2xl" />
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
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <MapPin className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SEO Local</h1>
          <p className="text-sm text-slate-500">Gérez vos fiches Google Business Profile</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: "#2563eb10" }}>
                <Store className="h-5 w-5" style={{ color: "#2563eb" }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{listings.length}</p>
                <p className="text-xs text-slate-500">Fiches</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: "#f59e0b10" }}>
                <Star className="h-5 w-5" style={{ color: "#f59e0b" }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{avgRating}</p>
                <p className="text-xs text-slate-500">Note moyenne ({totalReviews} avis)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: pendingReplies > 0 ? "#ef444410" : "#10b98110" }}>
                <MessageSquare className="h-5 w-5" style={{ color: pendingReplies > 0 ? "#ef4444" : "#10b981" }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{pendingReplies}</p>
                <p className="text-xs text-slate-500">Avis sans réponse</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: "#06b6d410" }}>
                <FileText className="h-5 w-5" style={{ color: "#06b6d4" }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{postsThisMonth}</p>
                <p className="text-xs text-slate-500">Posts ce mois</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <MapPin className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucune fiche Google Business Profile</p>
            <p className="text-sm mt-1">Ajoutez votre première fiche pour commencer à gérer votre SEO local.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">Vos fiches</h2>
          {listings.map((listing) => (
            <Link key={listing.id} href="/local/gbp">
              <Card className="border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full flex items-center justify-center shrink-0" style={{ background: "#2563eb10" }}>
                      <Store className="h-6 w-6" style={{ color: "#2563eb" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{listing.businessName}</span>
                        {listing.isVerified && (
                          <Badge className="text-[9px]" style={{ background: "#10b98115", color: "#10b981" }}>Vérifié</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{listing.category} · {listing.address}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold" style={{ color: listing.completionScore >= 80 ? "#10b981" : listing.completionScore >= 50 ? "#f59e0b" : "#ef4444" }}>
                        {listing.completionScore}%
                      </p>
                      <p className="text-[10px] text-slate-400">complétion</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: "/local/gbp", label: "Fiches Google", icon: Store, color: "#2563eb" },
          { href: "/local/reviews", label: "Avis", icon: Star, color: "#f59e0b" },
          { href: "/local/posts", label: "Posts Google", icon: FileText, color: "#06b6d4" },
          { href: "/local/rankings", label: "Rankings Maps", icon: MapPin, color: "#7c3aed" },
        ].map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="py-4 px-4 flex items-center gap-3">
                <link.icon className="h-5 w-5" style={{ color: link.color }} />
                <span className="text-sm font-medium text-slate-700">{link.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
