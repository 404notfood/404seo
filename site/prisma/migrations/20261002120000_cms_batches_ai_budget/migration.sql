-- AlterTable
ALTER TABLE "cms_corrections" ADD COLUMN     "resourceKind" TEXT NOT NULL DEFAULT 'page';
UPDATE "cms_corrections" c SET "resourceKind"='product'
FROM "cms_connections" connection WHERE c."connectionId"=connection.id AND connection.provider='PRESTASHOP';

-- AlterTable
ALTER TABLE "plan_configs" ADD COLUMN     "aiMonthlyBudgetCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aiMonthlyQuota" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cms_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SEO',
    "correctionIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "runToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "cms_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedMicros" INTEGER NOT NULL,
    "actualMicros" INTEGER,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cms_batches_status_leaseUntil_idx" ON "cms_batches"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "cms_batches_tenantId_projectId_createdAt_idx" ON "cms_batches"("tenantId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_requests_tenantId_createdAt_idx" ON "ai_requests"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "cms_batches" ADD CONSTRAINT "cms_batches_projectId_tenantId_fkey" FOREIGN KEY ("projectId", "tenantId") REFERENCES "projects"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_batches" ADD CONSTRAINT "cms_batches_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "cms_connections"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_projectId_tenantId_fkey" FOREIGN KEY ("projectId", "tenantId") REFERENCES "projects"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

