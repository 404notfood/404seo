-- CreateTable SharedReport
CREATE TABLE "shared_reports" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable ScheduledAudit
CREATE TABLE "scheduled_audits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "options" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shared_reports_token_key" ON "shared_reports"("token");

-- CreateIndex
CREATE INDEX "shared_reports_token_idx" ON "shared_reports"("token");

-- CreateIndex
CREATE INDEX "scheduled_audits_tenantId_idx" ON "scheduled_audits"("tenantId");

-- CreateIndex
CREATE INDEX "scheduled_audits_nextRunAt_isActive_idx" ON "scheduled_audits"("nextRunAt", "isActive");

-- AddForeignKey
ALTER TABLE "shared_reports" ADD CONSTRAINT "shared_reports_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_reports" ADD CONSTRAINT "shared_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_audits" ADD CONSTRAINT "scheduled_audits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_audits" ADD CONSTRAINT "scheduled_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_audits" ADD CONSTRAINT "scheduled_audits_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
