// apps/api/src/routes/billing.ts — Stripe Checkout + Portal + Webhook
import type { FastifyPluginAsync } from "fastify"
import Stripe from "stripe"
import { prisma } from "../lib/prisma"
import { requireBillingOwner } from "../lib/guards"
import { redis } from "../lib/redis"
import { randomUUID } from "node:crypto"
import { z } from "zod"

type Plan = "STARTER" | "PRO" | "AGENCY" | "ENTERPRISE"

// Helper : charger un PlanConfig depuis la DB
async function getPlanConfig(plan: string) {
  return prisma.planConfig.findUnique({ where: { plan: plan as Plan } })
}

// Helper : trouver un plan depuis un stripePriceId
async function getPlanByPriceId(priceId: string) {
  return prisma.planConfig.findFirst({ where: { stripePriceId: priceId } })
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant")
  return new Stripe(key, { apiVersion: "2026-02-25.clover" })
}

const billingRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/billing — Récupérer l'abonnement actuel + configs des plans
  fastify.get("/api/billing", async (request, reply) => {
    const month = new Date()
    month.setUTCDate(1)
    month.setUTCHours(0, 0, 0, 0)
    const usage = await prisma.auditReport.aggregate({ where: { tenantId: request.tenantId, audit: { createdAt: { gte: month } } }, _sum: { totalPages: true } })
    const [subscription, tenant, planConfigs] = await Promise.all([
      prisma.subscription.findUnique({ where: { tenantId: request.tenantId } }),
      prisma.tenant.findUnique({ where: { id: request.tenantId }, select: { plan: true } }),
      prisma.planConfig.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    ])

    return reply.send({
      plan: tenant?.plan ?? "STARTER",
      subscription: subscription
        ? {
            status: subscription.status,
            pagesQuota: subscription.pagesQuota,
            pagesUsed: usage._sum.totalPages ?? 0,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      plans: planConfigs,
    })
  })

  // POST /api/billing/checkout — Créer une session Stripe Checkout
  fastify.post("/api/billing/checkout", { preHandler: [requireBillingOwner] }, async (request, reply) => {
    const parsed = z.object({ plan: z.enum(["STARTER", "PRO", "AGENCY", "ENTERPRISE"]) }).safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: "Plan invalide" })
    const { plan } = parsed.data

    // Lire le PlanConfig depuis la DB
    const planConfig = await getPlanConfig(plan)
    if (!planConfig?.isActive) return reply.status(400).send({ error: "Plan indisponible" })
    if (!planConfig.stripePriceId) {
      return reply.status(400).send({ error: "Ce plan n'a pas de prix Stripe configuré. Configurez le stripePriceId dans /admin/plans." })
    }

    const stripe = getStripe()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const [subscription, tenant] = await Promise.all([
      prisma.subscription.findUnique({ where: { tenantId: request.tenantId } }),
      prisma.tenant.findUnique({ where: { id: request.tenantId }, select: { name: true } }),
    ])

    let customerId = subscription?.stripeCustomerId

    if (!customerId) {
      const user = await prisma.user.findFirst({
        where: { tenantId: request.tenantId },
        orderBy: { createdAt: "asc" },
      })
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        name: tenant?.name ?? undefined,
        metadata: { tenantId: request.tenantId },
      })
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?success=1`,
      cancel_url: `${appUrl}/settings/billing?cancelled=1`,
      metadata: { tenantId: request.tenantId, plan },
      subscription_data: { metadata: { tenantId: request.tenantId, plan } },
    })

    return reply.send({ url: session.url })
  })

  // POST /api/billing/portal — Portail de gestion Stripe
  fastify.post("/api/billing/portal", { preHandler: [requireBillingOwner] }, async (request, reply) => {
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: request.tenantId },
    })

    if (!subscription?.stripeCustomerId) {
      return reply.status(404).send({ error: "Aucun abonnement actif" })
    }

    const stripe = getStripe()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/settings/billing`,
    })

    return reply.send({ url: session.url })
  })

  // POST /api/billing/webhook — Webhooks Stripe (raw body requis)
  fastify.post<{ Body: Buffer }>(
    "/api/billing/webhook",
    async (request, reply) => {
      const sig = request.headers["stripe-signature"]
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

      if (!sig || !webhookSecret) {
        return reply.status(400).send({ error: "Signature manquante" })
      }

      const stripe = getStripe()
      let event: Stripe.Event

      try {
        event = stripe.webhooks.constructEvent(request.body, sig, webhookSecret)
      } catch {
        return reply.status(400).send({ error: "Signature webhook invalide" })
      }

      const doneKey = `stripe:done:${event.id}`
      const lockKey = `stripe:lock:${event.id}`
      if (await redis.exists(doneKey)) return reply.send({ received: true, skipped: true })
      const lockToken = randomUUID()
      if (!(await redis.set(lockKey, lockToken, "EX", 300, "NX"))) {
        return reply.status(503).send({ error: "Événement en cours, réessayer" })
      }
      try {
      if (await redis.exists(doneKey)) return reply.send({ received: true, skipped: true })
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session
          const tenantId = session.metadata?.tenantId
          const rawPlan = session.metadata?.plan
          const VALID_PLANS = ["STARTER", "PRO", "AGENCY", "ENTERPRISE"]
          const plan = rawPlan && VALID_PLANS.includes(rawPlan) ? (rawPlan as Plan) : undefined

          if (!tenantId || !plan) break

          const subscriptionId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null

          // Récupérer les dates de période depuis l'abonnement Stripe
          let periodStart: Date | null = null
          let periodEnd: Date | null = null
          if (subscriptionId) {
            const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)
            const item = stripeSub.items.data[0]
            if (item) {
              periodStart = new Date((item as unknown as { current_period_start: number }).current_period_start * 1000)
              periodEnd = new Date((item as unknown as { current_period_end: number }).current_period_end * 1000)
            }
          }

          // Lire le quota depuis PlanConfig en DB (fallback 100)
          const planCfg = await getPlanConfig(plan)
          const pagesQuota = planCfg?.pageQuota ?? 100
          const stripePriceId = planCfg?.stripePriceId ?? ""

          await prisma.$transaction([
            prisma.tenant.update({
              where: { id: tenantId },
              data: { plan },
            }),
            prisma.subscription.upsert({
              where: { tenantId },
              create: {
                tenantId,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: subscriptionId,
                stripePriceId,
                plan,
                status: "ACTIVE",
                pagesQuota,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              },
              update: {
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: subscriptionId,
                stripePriceId,
                plan,
                status: "ACTIVE",
                pagesQuota,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              },
            }),
            // Promotion: tout utilisateur GUEST du tenant devient MEMBER après paiement confirmé.
            prisma.user.updateMany({
              where: { tenantId, role: "GUEST" },
              data: { role: "MEMBER" },
            }),
          ])
          break
        }

        case "customer.subscription.updated": {
          // Stripe does not guarantee event order; read the current subscription.
          const sub = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id)
          const storedSubscription = await prisma.subscription.findUnique({ where: { stripeSubscriptionId: sub.id } })
          if (!storedSubscription) throw new Error("Abonnement non encore enregistré, réessayer")

          const isActive = ["active", "trialing"].includes(sub.status)
          const priceId = sub.items.data[0]?.price.id ?? null

          // Détecter le plan et son quota depuis PlanConfig en DB via le priceId
          const updatedPlanCfg = priceId ? await getPlanByPriceId(priceId) : null
          const plan = (updatedPlanCfg?.plan ?? "STARTER") as Plan
          const pagesQuotaUpdated = updatedPlanCfg?.pageQuota ?? 100

          const subItem = sub.items.data[0]
          const itemPeriodStart = subItem ? (subItem as unknown as { current_period_start?: number }).current_period_start : undefined
          const itemPeriodEnd = subItem ? (subItem as unknown as { current_period_end?: number }).current_period_end : undefined

          await prisma.$transaction(async tx => {
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data: {
              status: isActive ? "ACTIVE" : "PAST_DUE",
              stripePriceId: priceId,
              plan,
              pagesQuota: pagesQuotaUpdated,
              currentPeriodStart: itemPeriodStart ? new Date(itemPeriodStart * 1000) : undefined,
              currentPeriodEnd: itemPeriodEnd ? new Date(itemPeriodEnd * 1000) : undefined,
            },
          })

          // Mettre à jour le plan sur le tenant aussi
          const record = await tx.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } })
          if (record) {
            await Promise.all([
              tx.tenant.update({ where: { id: record.tenantId }, data: { plan: isActive ? plan : "STARTER" } }),
              ...(isActive
                ? [
                    tx.user.updateMany({
                      where: { tenantId: record.tenantId, role: "GUEST" },
                      data: { role: "MEMBER" },
                    }),
                  ]
                : []),
            ])
          }
          })
          break
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription
          await prisma.$transaction(async tx => {
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: sub.id },
            data: { status: "CANCELLED" },
          })
          const record = await tx.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } })
          if (record) {
            await tx.tenant.update({ where: { id: record.tenantId }, data: { plan: "STARTER" } })
          }
          })
          break
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice
          const invoiceSubscription = invoice.parent?.subscription_details?.subscription
          const subId = typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription?.id ?? null
          if (subId) {
            await prisma.subscription.updateMany({
              where: { stripeSubscriptionId: subId },
              data: { status: "PAST_DUE" },
            })
          }
          break
        }
      }

      await redis.set(doneKey, "1", "EX", 7 * 24 * 60 * 60)
      return reply.send({ received: true })
      } finally {
        await redis.eval('if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end', 1, lockKey, lockToken)
      }
    }
  )
}

export default billingRoutes
