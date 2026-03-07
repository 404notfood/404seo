import type { FastifyPluginAsync } from "fastify"
import { prisma } from "../lib/prisma"
import { requireSuperAdmin } from "../lib/guards"
import { resolveAllFeatures, FEATURES } from "../lib/features"

type Plan = "STARTER" | "PRO" | "AGENCY" | "ENTERPRISE"

const DEFAULT_PLANS = [
  {
    plan: "STARTER" as Plan,
    displayName: "Starter",
    price: 0,
    priceYearly: 0,
    auditQuota: 5,
    pageQuota: 100,
    projectQuota: 3,
    userQuota: 1,
    featureAI: false,
    featureRankTracking: false,
    featureLocalSeo: false,
    featureWhiteLabel: true,
    featureApiAccess: false,
    featureCompetitors: false,
    featureBacklinks: true,
    sortOrder: 0,
  },
  {
    plan: "PRO" as Plan,
    displayName: "Pro",
    price: 9900,
    priceYearly: 99000,
    auditQuota: 100,
    pageQuota: 10000,
    projectQuota: 20,
    userQuota: 5,
    featureAI: true,
    featureRankTracking: true,
    featureLocalSeo: false,
    featureWhiteLabel: true,
    featureApiAccess: false,
    featureCompetitors: true,
    featureBacklinks: true,
    sortOrder: 1,
  },
  {
    plan: "AGENCY" as Plan,
    displayName: "Agency",
    price: 24900,
    priceYearly: 249000,
    auditQuota: -1,
    pageQuota: 100000,
    projectQuota: -1,
    userQuota: 20,
    featureAI: true,
    featureRankTracking: true,
    featureLocalSeo: true,
    featureWhiteLabel: true,
    featureApiAccess: true,
    featureCompetitors: true,
    featureBacklinks: true,
    sortOrder: 2,
  },
]

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Toutes les routes admin requièrent le rôle ADMIN
  fastify.addHook("preHandler", requireSuperAdmin())

  // ── Stats globales ────────────────────────────────────────────────

  fastify.get("/api/admin/stats", async () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [tenantCount, userCount, auditsThisMonth, subscriptions, planBreakdownRaw] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.audit.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.subscription.findMany({ select: { plan: true, status: true } }),
      prisma.tenant.groupBy({ by: ["plan"], _count: { id: true } }),
    ])

    // MRR simplifié : compter les subscriptions actives par plan
    const PLAN_PRICES: Record<string, number> = { STARTER: 0, PRO: 99, AGENCY: 249 }
    const mrr = subscriptions
      .filter((s) => s.status === "ACTIVE")
      .reduce((sum, s) => sum + (PLAN_PRICES[s.plan] ?? 0), 0)

    const planBreakdown: Record<string, number> = {}
    for (const row of planBreakdownRaw) {
      planBreakdown[row.plan] = row._count.id
    }

    return { mrr, tenantCount, userCount, auditsThisMonth, planBreakdown }
  })

  // ── Utilisateurs ────────────────────────────────────────────────

  fastify.get<{
    Querystring: { search?: string; page?: string; role?: string; banned?: string }
  }>("/api/admin/users", async (request) => {
    const { search, page = "1", role, banned } = request.query
    const pageNum = Math.max(1, parseInt(page))
    const limit = 50
    const skip = (pageNum - 1) * limit

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }
    if (role) where.role = role
    if (banned !== undefined) where.isBanned = banned === "true"

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isBanned: true,
          bannedAt: true,
          tenantId: true,
          createdAt: true,
          tenant: { select: { name: true, plan: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return { users, total, pages: Math.ceil(total / limit) }
  })

  fastify.patch<{
    Params: { id: string }
    Body: { role?: string; isBanned?: boolean }
  }>("/api/admin/users/:id", async (request, reply) => {
    const { id } = request.params
    const { role, isBanned } = request.body

    const update: Record<string, unknown> = {}
    if (role !== undefined) update.role = role
    if (isBanned !== undefined) {
      update.isBanned = isBanned
      update.bannedAt = isBanned ? new Date() : null
      update.bannedBy = isBanned ? request.userId : null
    }

    if (Object.keys(update).length === 0) {
      return reply.status(400).send({ error: "Aucune modification fournie" })
    }

    const user = await prisma.user.update({
      where: { id },
      data: update,
      select: { id: true, name: true, email: true, role: true, isBanned: true },
    })
    return user
  })

  // ── Tenants ──────────────────────────────────────────────────────

  fastify.get<{
    Querystring: { plan?: string; suspended?: string; page?: string }
  }>("/api/admin/tenants", async (request) => {
    const { plan, suspended, page = "1" } = request.query
    const pageNum = Math.max(1, parseInt(page))
    const limit = 50
    const skip = (pageNum - 1) * limit

    const where: Record<string, unknown> = {}
    if (plan) where.plan = plan
    if (suspended !== undefined) where.isSuspended = suspended === "true"

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          isSuspended: true,
          createdAt: true,
          _count: { select: { users: true } },
          audits: {
            where: { createdAt: { gte: startOfMonth } },
            select: { id: true },
          },
          subscription: { select: { status: true, stripeSubscriptionId: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ])

    const PLAN_PRICES: Record<string, number> = { STARTER: 0, PRO: 99, AGENCY: 249 }

    return {
      tenants: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        plan: t.plan,
        isSuspended: t.isSuspended,
        createdAt: t.createdAt,
        userCount: t._count.users,
        auditCount: t.audits.length,
        mrr: t.subscription?.status === "ACTIVE" ? (PLAN_PRICES[t.plan] ?? 0) : 0,
      })),
      total,
      pages: Math.ceil(total / limit),
    }
  })

  fastify.patch<{
    Params: { id: string }
    Body: { plan?: string; isSuspended?: boolean; name?: string }
  }>("/api/admin/tenants/:id", async (request, reply) => {
    const { id } = request.params
    const { plan, isSuspended, name } = request.body

    const update: Record<string, unknown> = {}
    if (plan !== undefined) update.plan = plan
    if (name !== undefined) update.name = name
    if (isSuspended !== undefined) {
      update.isSuspended = isSuspended
      update.suspendedAt = isSuspended ? new Date() : null
      update.suspendedBy = isSuspended ? request.userId : null
    }

    if (Object.keys(update).length === 0) {
      return reply.status(400).send({ error: "Aucune modification fournie" })
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: update,
      select: { id: true, name: true, plan: true, isSuspended: true },
    })
    return tenant
  })

  fastify.get<{ Params: { id: string } }>("/api/admin/tenants/:id", async (request, reply) => {
    const { id } = request.params

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, projects: true } },
        subscription: true,
        audits: {
          where: { createdAt: { gte: startOfMonth } },
          select: { id: true },
        },
      },
    })

    if (!tenant) return reply.status(404).send({ error: "Tenant introuvable" })

    const features = await resolveAllFeatures(id)

    const PLAN_PRICES: Record<string, number> = { STARTER: 0, PRO: 99, AGENCY: 249 }

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      isSuspended: tenant.isSuspended,
      suspendedAt: tenant.suspendedAt,
      createdAt: tenant.createdAt,
      userCount: tenant._count.users,
      projectCount: tenant._count.projects,
      auditCount: tenant.audits.length,
      mrr: tenant.subscription?.status === "ACTIVE" ? (PLAN_PRICES[tenant.plan] ?? 0) : 0,
      subscription: tenant.subscription
        ? {
            status: tenant.subscription.status,
            stripeCustomerId: tenant.subscription.stripeCustomerId,
            stripeSubscriptionId: tenant.subscription.stripeSubscriptionId,
            currentPeriodEnd: tenant.subscription.currentPeriodEnd,
          }
        : null,
      features,
    }
  })

  // ── Feature overrides ────────────────────────────────────────────

  fastify.get<{ Params: { id: string } }>("/api/admin/tenants/:id/features", async (request, reply) => {
    const { id } = request.params
    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
    if (!tenant) return reply.status(404).send({ error: "Tenant introuvable" })

    const features = await resolveAllFeatures(id)
    return { features }
  })

  fastify.post<{
    Params: { id: string }
    Body: { feature: string; enabled: boolean; note?: string }
  }>("/api/admin/tenants/:id/features", async (request, reply) => {
    const { id } = request.params
    const { feature, enabled, note } = request.body

    const validFeatures = FEATURES.map((f) => f.key)
    if (!validFeatures.includes(feature)) {
      return reply.status(400).send({ error: "Feature invalide" })
    }

    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
    if (!tenant) return reply.status(404).send({ error: "Tenant introuvable" })

    const result = await prisma.tenantFeature.upsert({
      where: { tenantId_feature: { tenantId: id, feature } },
      update: { enabled, note: note ?? null, setBy: request.userId, updatedAt: new Date() },
      create: { tenantId: id, feature, enabled, note: note ?? null, setBy: request.userId },
    })

    return result
  })

  // Route pour supprimer un override (reset au défaut du plan)
  fastify.delete<{
    Params: { id: string; feature: string }
  }>("/api/admin/tenants/:id/features/:feature", async (request, reply) => {
    const { id, feature } = request.params
    await prisma.tenantFeature.deleteMany({
      where: { tenantId: id, feature },
    })
    reply.status(204).send()
  })

  // ── Plans ────────────────────────────────────────────────────────

  fastify.get("/api/admin/plans", async () => {
    const plans = await prisma.planConfig.findMany({ orderBy: { sortOrder: "asc" } })
    return { plans }
  })

  fastify.put<{
    Params: { plan: string }
    Body: {
      displayName?: string
      price?: number
      priceYearly?: number
      stripePriceId?: string
      stripePriceIdYearly?: string
      auditQuota?: number
      pageQuota?: number
      projectQuota?: number
      userQuota?: number
      featureAI?: boolean
      featureRankTracking?: boolean
      featureLocalSeo?: boolean
      featureWhiteLabel?: boolean
      featureApiAccess?: boolean
      featureCompetitors?: boolean
      featureBacklinks?: boolean
      isActive?: boolean
    }
  }>("/api/admin/plans/:plan", async (request, reply) => {
    const { plan } = request.params

    const validPlans = ["STARTER", "PRO", "AGENCY", "ENTERPRISE"]
    if (!validPlans.includes(plan)) {
      return reply.status(400).send({ error: "Plan invalide" })
    }

    const existing = await prisma.planConfig.findUnique({ where: { plan: plan as Plan } })
    if (!existing) return reply.status(404).send({ error: "Configuration de plan introuvable" })

    const config = await prisma.planConfig.update({
      where: { plan: plan as Plan },
      data: request.body,
    })
    return config
  })

  // POST /api/admin/plans — Créer une nouvelle configuration de plan
  fastify.post<{
    Body: {
      plan: string
      displayName: string
      price: number
      priceYearly?: number
      auditQuota: number
      pageQuota: number
      projectQuota: number
      userQuota: number
      featureAI?: boolean
      featureRankTracking?: boolean
      featureLocalSeo?: boolean
      featureWhiteLabel?: boolean
      featureApiAccess?: boolean
      featureCompetitors?: boolean
      featureBacklinks?: boolean
      sortOrder?: number
    }
  }>("/api/admin/plans", async (request, reply) => {
    const validPlans = ["STARTER", "PRO", "AGENCY", "ENTERPRISE"]
    const { plan, displayName, ...rest } = request.body
    if (!plan || !validPlans.includes(plan)) {
      return reply.status(400).send({ error: "Plan invalide. Valeurs acceptées : STARTER, PRO, AGENCY, ENTERPRISE" })
    }
    const existing = await prisma.planConfig.findUnique({ where: { plan: plan as Plan } })
    if (existing) {
      return reply.status(409).send({ error: "Un PlanConfig existe déjà pour ce plan" })
    }
    const config = await prisma.planConfig.create({
      data: {
        plan: plan as Plan,
        displayName: displayName || plan,
        ...rest,
      },
    })
    return reply.status(201).send(config)
  })

  fastify.post("/api/admin/plans/seed", async () => {
    const results = []
    for (const planData of DEFAULT_PLANS) {
      const existing = await prisma.planConfig.findUnique({ where: { plan: planData.plan } })
      if (!existing) {
        const created = await prisma.planConfig.create({ data: planData })
        results.push({ plan: planData.plan, action: "created", id: created.id })
      } else {
        results.push({ plan: planData.plan, action: "already_exists", id: existing.id })
      }
    }
    return { results }
  })
}

export default adminRoutes
