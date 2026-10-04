ALTER TABLE "search_console_snapshots" ADD COLUMN "queriesIncluded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "queryRowLimitReached" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "seo_actions_id_tenantId_key" ON "seo_actions"("id", "tenantId");

CREATE TABLE "search_console_query_metrics" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "rowKey" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "pageUrl" TEXT NOT NULL,
  "clicks" DOUBLE PRECISION NOT NULL,
  "impressions" DOUBLE PRECISION NOT NULL,
  "ctr" DOUBLE PRECISION NOT NULL,
  "position" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "search_console_query_metrics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "search_console_query_metrics_snapshotId_rowKey_key" ON "search_console_query_metrics"("snapshotId", "rowKey");
CREATE INDEX "search_console_query_metrics_tenantId_snapshotId_idx" ON "search_console_query_metrics"("tenantId", "snapshotId");
ALTER TABLE "search_console_query_metrics" ADD CONSTRAINT "search_console_query_metrics_snapshotId_tenantId_fkey" FOREIGN KEY ("snapshotId", "tenantId") REFERENCES "search_console_snapshots"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "seo_action_measurements" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "googleAccountId" TEXT NOT NULL,
  "propertyUrl" TEXT NOT NULL,
  "implementedAt" TIMESTAMP(3) NOT NULL,
  "windowDays" INTEGER NOT NULL,
  "beforeStartDate" TEXT NOT NULL,
  "beforeEndDate" TEXT NOT NULL,
  "afterStartDate" TEXT NOT NULL,
  "afterEndDate" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "rowLimitReached" BOOLEAN NOT NULL DEFAULT false,
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seo_action_measurements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seo_action_measurements_actionId_implementedAt_windowDays_key" ON "seo_action_measurements"("actionId", "implementedAt", "windowDays");
CREATE INDEX "seo_action_measurements_tenantId_actionId_idx" ON "seo_action_measurements"("tenantId", "actionId");
ALTER TABLE "seo_action_measurements" ADD CONSTRAINT "seo_action_measurements_actionId_tenantId_fkey" FOREIGN KEY ("actionId", "tenantId") REFERENCES "seo_actions"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seo_action_measurements" ADD CONSTRAINT "seo_action_measurements_googleAccountId_tenantId_fkey" FOREIGN KEY ("googleAccountId", "tenantId") REFERENCES "google_accounts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
