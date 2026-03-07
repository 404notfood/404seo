-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedBy" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "bannedBy" TEXT,
ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "plan_configs" (
    "id" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "displayName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "priceYearly" INTEGER,
    "stripePriceId" TEXT,
    "stripePriceIdYearly" TEXT,
    "auditQuota" INTEGER NOT NULL,
    "pageQuota" INTEGER NOT NULL,
    "projectQuota" INTEGER NOT NULL,
    "userQuota" INTEGER NOT NULL,
    "featureAI" BOOLEAN NOT NULL DEFAULT false,
    "featureRankTracking" BOOLEAN NOT NULL DEFAULT false,
    "featureLocalSeo" BOOLEAN NOT NULL DEFAULT false,
    "featureWhiteLabel" BOOLEAN NOT NULL DEFAULT true,
    "featureApiAccess" BOOLEAN NOT NULL DEFAULT false,
    "featureCompetitors" BOOLEAN NOT NULL DEFAULT false,
    "featureBacklinks" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_features" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "note" TEXT,
    "setBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_configs_plan_key" ON "plan_configs"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_features_tenantId_feature_key" ON "tenant_features"("tenantId", "feature");

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
