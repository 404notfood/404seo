"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Store, MapPin, Phone, Globe, Clock, CheckCircle2 } from "lucide-react"
import { useLocalListings } from "@/hooks/useLocal"

function completionColor(score: number) {
  return score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
}

export default function GBPListingsPage() {
  const { data: listings, isLoading } = useLocalListings()

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    )
  }

  const items = listings ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl" style={{ background: "rgba(37,99,235,0.1)" }}>
          <Store className="h-6 w-6" style={{ color: "#2563eb" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fiches Google Business Profile</h1>
          <p className="text-sm text-slate-500">Gérez et optimisez vos fiches d'établissement</p>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="border-slate-100 rounded-2xl shadow-sm">
          <CardContent className="py-12 text-center text-slate-500">
            <Store className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Aucune fiche configurée</p>
            <p className="text-sm mt-1">Connectez votre compte Google Business Profile pour commencer.</p>
          </CardContent>
        </Card>
      ) : (
        items.map((listing) => (
          <Card key={listing.id} className="border-slate-100 rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {listing.businessName}
                  {listing.isVerified && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                </CardTitle>
                <Badge
                  className="text-xs"
                  style={{
                    background: listing.status === "ACTIVE" ? "#10b98115" : "#ef444415",
                    color: listing.status === "ACTIVE" ? "#10b981" : "#ef4444",
                  }}
                >
                  {listing.status === "ACTIVE" ? "Actif" : listing.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                  {listing.address}
                </div>
                {listing.phone && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                    {listing.phone}
                  </div>
                )}
                {listing.website && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">{listing.website}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                  {listing.category}
                </div>
              </div>

              {/* Completion score */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-medium">Score de complétion</span>
                  <span className="font-bold" style={{ color: completionColor(listing.completionScore) }}>
                    {listing.completionScore}%
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${listing.completionScore}%`,
                      background: completionColor(listing.completionScore),
                    }}
                  />
                </div>
              </div>

              {/* Quick stats */}
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{listing._count.reviews} avis</span>
                <span>{listing._count.posts} posts</span>
                <span>{listing._count.photos} photos</span>
                <span>{listing._count.rankings} mots-clés suivis</span>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
