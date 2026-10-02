-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "analyticsSyncStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "quality" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_page_metrics" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "sessions" DOUBLE PRECISION NOT NULL,
    "keyEvents" DOUBLE PRECISION NOT NULL,
    "purchaseRevenue" DOUBLE PRECISION,

    CONSTRAINT "analytics_page_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_action_measurements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "implementedAt" TIMESTAMP(3) NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "beforeStartDate" TEXT NOT NULL,
    "beforeEndDate" TEXT NOT NULL,
    "afterStartDate" TEXT NOT NULL,
    "afterEndDate" TEXT NOT NULL,
    "quality" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_action_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_snapshots_tenantId_projectId_importedAt_idx" ON "analytics_snapshots"("tenantId", "projectId", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_snapshots_id_tenantId_key" ON "analytics_snapshots"("id", "tenantId");

-- CreateIndex
CREATE INDEX "analytics_page_metrics_tenantId_snapshotId_idx" ON "analytics_page_metrics"("tenantId", "snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_page_metrics_snapshotId_pageUrl_key" ON "analytics_page_metrics"("snapshotId", "pageUrl");

-- CreateIndex
CREATE INDEX "analytics_action_measurements_tenantId_actionId_idx" ON "analytics_action_measurements"("tenantId", "actionId");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_action_measurements_actionId_implementedAt_window_key" ON "analytics_action_measurements"("actionId", "implementedAt", "windowDays");

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_projectId_tenantId_fkey" FOREIGN KEY ("projectId", "tenantId") REFERENCES "projects"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_googleAccountId_tenantId_fkey" FOREIGN KEY ("googleAccountId", "tenantId") REFERENCES "google_accounts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_page_metrics" ADD CONSTRAINT "analytics_page_metrics_snapshotId_tenantId_fkey" FOREIGN KEY ("snapshotId", "tenantId") REFERENCES "analytics_snapshots"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_action_measurements" ADD CONSTRAINT "analytics_action_measurements_actionId_tenantId_fkey" FOREIGN KEY ("actionId", "tenantId") REFERENCES "seo_actions"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_action_measurements" ADD CONSTRAINT "analytics_action_measurements_googleAccountId_tenantId_fkey" FOREIGN KEY ("googleAccountId", "tenantId") REFERENCES "google_accounts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
