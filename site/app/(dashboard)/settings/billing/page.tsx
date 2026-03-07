"use client"

import { useQuery, useMutation } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { CheckCircle, Zap, CreditCard, AlertCircle, Lock } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useEffect, Suspense } from "react"
import type { PlanConfig } from "@/lib/api-client"

// Labels lisibles pour chaque feature
const FEATURE_LABELS: Record<string, string> = {
  featureAI:           "Recommandations IA",
  featureRankTracking: "Suivi de positions",
  featureLocalSeo:     "SEO Local (GBP, avis)",
  featureWhiteLabel:   "Marque blanche PDF",
  featureApiAccess:    "Accès API REST",
  featureCompetitors:  "Analyse concurrents",
  featureBacklinks:    "Profil de backlinks",
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  ACTIVE:    { label: "Actif",              variant: "default" },
  PAST_DUE:  { label: "Paiement en retard", variant: "destructive" },
  CANCELLED: { label: "Annulé",             variant: "secondary" },
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Gratuit"
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} € / mois`
}

function formatQuota(val: number, unit: string): string {
  if (val === -1) return `Illimité en ${unit}`
  return `${val.toLocaleString("fr-FR")} ${unit}`
}

function getActiveFeatures(plan: PlanConfig): string[] {
  return Object.entries(FEATURE_LABELS)
    .filter(([key]) => (plan as unknown as Record<string, unknown>)[key] === true)
    .map(([, label]) => label)
}

function SuccessToast() {
  const params = useSearchParams()
  useEffect(() => {
    if (params.get("success"))   toast.success("Abonnement activé !")
    if (params.get("cancelled")) toast.info("Paiement annulé")
  }, [params])
  return null
}

function PlanCardSkeleton() {
  return <Skeleton className="h-80 rounded-2xl" />
}

export default function BillingPage() {
  const { data: billing, isLoading } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiClient.getBilling(),
  })

  const checkout = useMutation({
    mutationFn: (plan: string) => apiClient.createCheckout(plan),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
    onError: (err: Error) => toast.error(err.message || "Erreur lors de la redirection vers Stripe"),
  })

  const portal = useMutation({
    mutationFn: () => apiClient.createPortal(),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
    onError: () => toast.error("Impossible d'ouvrir le portail de facturation"),
  })

  const currentPlan = billing?.plan ?? "STARTER"
  const sub = billing?.subscription
  const plans = billing?.plans ?? []
  const pagesPercent = sub ? Math.min(100, Math.round((sub.pagesUsed / sub.pagesQuota) * 100)) : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Suspense><SuccessToast /></Suspense>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Facturation</h1>
        <p className="text-slate-500 mt-1">Gérez votre abonnement et vos paiements</p>
      </div>

      {/* ── Quota usage ── */}
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

      {/* ── Plans dynamiques ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {[0, 1, 2].map((i) => <PlanCardSkeleton key={i} />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="mb-8 p-8 rounded-2xl border border-slate-200 bg-slate-50 text-center">
          <p className="text-slate-500">Plans non configurés — contactez l&apos;administrateur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.plan
            const features = getActiveFeatures(plan)
            const isFree = plan.price === 0
            const hasStripePrice = !!plan.stripePriceId
            const isPopular = plan.plan === "PRO"

            return (
              <Card
                key={plan.plan}
                className={[
                  "relative flex flex-col transition-shadow",
                  isCurrent ? "border-blue-300 shadow-md shadow-blue-100" : "",
                  isPopular && !isCurrent ? "border-blue-200" : "",
                ].join(" ")}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Populaire
                    </span>
                  </div>
                )}

                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.displayName}</CardTitle>
                    {isCurrent && <Badge className="bg-blue-600 text-white text-xs">Actuel</Badge>}
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-bold text-slate-900">{formatPrice(plan.price)}</span>
                    {plan.priceYearly && plan.priceYearly > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        ou {formatPrice(Math.round(plan.priceYearly / 12))}/mois facturé annuellement
                      </p>
                    )}
                  </div>
                  <CardDescription>{formatQuota(plan.pageQuota, "pages/audit")}</CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col flex-1">
                  <ul className="space-y-2 mb-5 flex-1">
                    {/* Quota audits/mois */}
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      {formatQuota(plan.auditQuota, "audits / mois")}
                    </li>
                    {/* Projets */}
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      {formatQuota(plan.projectQuota, "projets")}
                    </li>
                    {/* Utilisateurs */}
                    <li className="text-sm text-slate-600 flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      {formatQuota(plan.userQuota, "utilisateurs")}
                    </li>
                    {/* Features actives */}
                    {features.map((f) => (
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
                  ) : isFree ? (
                    <Button className="w-full" variant="outline" disabled>
                      Gratuit
                    </Button>
                  ) : !hasStripePrice ? (
                    <Button className="w-full" variant="outline" disabled title="Le prix Stripe n'est pas encore configuré par l'administrateur">
                      <Lock className="h-4 w-4 mr-2" />
                      Prix non configuré
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={isPopular ? "default" : "outline"}
                      onClick={() => checkout.mutate(plan.plan)}
                      disabled={checkout.isPending}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      {currentPlan !== "STARTER" ? `Passer au ${plan.displayName}` : `Choisir ${plan.displayName}`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Portail Stripe ── */}
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
