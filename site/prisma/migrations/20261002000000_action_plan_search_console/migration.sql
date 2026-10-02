ALTER TABLE "projects" ADD COLUMN "gscSyncStartedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "projects_id_tenantId_key" ON "projects"("id", "tenantId");
CREATE UNIQUE INDEX "google_accounts_id_tenantId_key" ON "google_accounts"("id", "tenantId");

CREATE TYPE "SeoActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'DISMISSED');

CREATE TABLE "search_console_snapshots" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "googleAccountId" TEXT NOT NULL,
  "propertyUrl" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "rowLimitReached" BOOLEAN NOT NULL DEFAULT false,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_console_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "search_console_snapshots_id_tenantId_key" ON "search_console_snapshots"("id", "tenantId");
CREATE INDEX "search_console_snapshots_tenantId_projectId_importedAt_idx" ON "search_console_snapshots"("tenantId", "projectId", "importedAt");

CREATE TABLE "search_console_page_metrics" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "pageUrl" TEXT NOT NULL,
  "clicks" DOUBLE PRECISION NOT NULL,
  "impressions" DOUBLE PRECISION NOT NULL,
  "ctr" DOUBLE PRECISION NOT NULL,
  "position" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "search_console_page_metrics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "search_console_page_metrics_snapshotId_pageUrl_key" ON "search_console_page_metrics"("snapshotId", "pageUrl");
CREATE INDEX "search_console_page_metrics_tenantId_idx" ON "search_console_page_metrics"("tenantId");

CREATE TABLE "seo_actions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "checkName" TEXT NOT NULL,
  "status" "SeoActionStatus" NOT NULL DEFAULT 'OPEN',
  "note" TEXT NOT NULL DEFAULT '',
  "baselineAuditId" TEXT,
  "expectedPageUrls" TEXT[],
  "implementedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "verifiedAuditId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "seo_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seo_actions_projectId_checkName_key" ON "seo_actions"("projectId", "checkName");
CREATE INDEX "seo_actions_tenantId_projectId_idx" ON "seo_actions"("tenantId", "projectId");

ALTER TABLE "search_console_snapshots" ADD CONSTRAINT "search_console_snapshots_projectId_tenantId_fkey" FOREIGN KEY ("projectId", "tenantId") REFERENCES "projects"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "search_console_snapshots" ADD CONSTRAINT "search_console_snapshots_googleAccountId_tenantId_fkey" FOREIGN KEY ("googleAccountId", "tenantId") REFERENCES "google_accounts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "search_console_page_metrics" ADD CONSTRAINT "search_console_page_metrics_snapshotId_tenantId_fkey" FOREIGN KEY ("snapshotId", "tenantId") REFERENCES "search_console_snapshots"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seo_actions" ADD CONSTRAINT "seo_actions_projectId_tenantId_fkey" FOREIGN KEY ("projectId", "tenantId") REFERENCES "projects"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
