"use client"

import { useQuery, useMutation } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { CheckCircle, Zap, Building2, CreditCard, AlertCircle } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, Suspense } from "react"

const PLANS = [
  {
    key: "STARTER" as const,
    name: "Starter",
    price: "Gratuit",
    quota: "100 pages / mois",
    icon: CheckCircle,
    features: ["1 projet", "Audit technique de base", "Export PDF"],
  },
  {
    key: "PRO" as const,
    name: "Pro",
    price: "29€ / mois",
    quota: "10 000 pages / mois",
    icon: Zap,
    features: ["Projets illimités", "Audit complet", "IA suggestions", "Export PDF"],
    highlight: true,
  },
  {
    key: "AGENCY" as const,
    name: "Agency",
    price: "99€ / mois",
    quota: "100 000 pages / mois",
    icon: Building2,
    features: ["Multi-tenant", "White label", "API access", "Support prioritaire"],
  },
]

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  ACTIVE:    { label: "Actif",              variant: "default" },
  PAST_DUE:  { label: "Paiement en retard", variant: "destructive" },
  CANCELLED: { label: "Annulé",             variant: "secondary" },
}

function SuccessToast() {
  const params = useSearchParams()
  useEffect(() => {
    if (params.get("success"))   toast.success("Abonnement activé !")
    if (params.get("cancelled")) toast.info("Paiement annulé")
  }, [params])
  return null
}

export default function BillingPage() {
  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiClient.getBilling(),
  })

  const checkout = useMutation({
    mutationFn: (plan: string) => apiClient.createCheckout(plan),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
    onError: () => toast.error("Erreur lors de la redirection vers Stripe"),
  })

  const portal = useMutation({
    mutationFn: () => apiClient.createPortal(),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
    onError: () => toast.error("Impossible d'ouvrir le portail de facturation"),
  })

  const currentPlan = billing?.plan ?? "STARTER"
  const sub = billing?.subscription
  const pagesPercent = sub ? Math.round((sub.pagesUsed / sub.pagesQuota) * 100) : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Suspense><SuccessToast /></Suspense>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Facturation</h1>
        <p className="text-slate-500 mt-1">Gérez votre abonnement et vos paiements</p>
      </div>

      {/* Quota usage */}
      {isLoading ? (
        <Skeleton className="h-24 w-full mb-8 rounded-xl" />
      ) : sub ? (
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Pages analysées ce mois</p>
                <p className="text-2xl font-bold text-slate-900 mt-0.5">
                  {sub.pagesUsed.toLocaleString("fr-FR")}
                  <span className="text-base font-normal text-slate-400 ml-1">
                    / {sub.pagesQuota.toLocaleString("fr-FR")}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                {STATUS_LABEL[sub.status] && (
                  <Badge variant={STATUS_LABEL[sub.status].variant}>
                    {STATUS_LABEL[sub.status].label}
                  </Badge>
                )}
                {sub.status === "PAST_DUE" && (
                  <p className="flex items-center gap-1 text-amber-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    Mettez à jour votre moyen de paiement
                  </p>
                )}
              </div>
            </div>
            <Progress value={pagesPercent} className="h-2" />
            <p className="text-xs text-slate-400 mt-2">
              {pagesPercent}% utilisé
              {sub.currentPeriodEnd && (
                <> — renouvellement le {new Date(sub.currentPeriodEnd).toLocaleDateString("fr-FR")}</>
              )}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {PLANS.map((plan) => {
          const Icon = plan.icon
          const isCurrent = currentPlan === plan.key

          return (
            <Card
              key={plan.key}
              className={[
                "relative transition-shadow",
                isCurrent ? "border-blue-300 shadow-md shadow-blue-100" : "",
                plan.highlight && !isCurrent ? "border-blue-200" : "",
              ].join(" ")}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Populaire
                  </span>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${isCurrent ? "text-blue-600" : "text-slate-400"}`} />
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </div>
                  {isCurrent && <Badge className="bg-blue-600 text-white text-xs">Actuel</Badge>}
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-slate-900">{plan.price}</span>
                </div>
                <CardDescription>{plan.quota}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button className="w-full" variant="outline" disabled>
                    Plan actuel
                  </Button>
                ) : plan.key === "STARTER" ? (
                  <Button className="w-full" variant="outline" disabled>
                    Gratuit
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    onClick={() => checkout.mutate(plan.key)}
                    disabled={checkout.isPending}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    {currentPlan !== "STARTER" ? `Passer au ${plan.name}` : `Choisir ${plan.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Portail Stripe */}
      {sub && currentPlan !== "STARTER" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gérer l&apos;abonnement</CardTitle>
            <CardDescription>
              Modifiez votre moyen de paiement, téléchargez vos factures ou annulez votre abonnement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Portail de facturation Stripe
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
