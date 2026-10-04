ALTER TABLE "projects" ADD COLUMN "sitemapSyncStartedAt" TIMESTAMP(3);

CREATE TABLE "sitemap_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageCount" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    CONSTRAINT "sitemap_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sitemap_snapshots_id_tenantId_key" ON "sitemap_snapshots"("id", "tenantId");
CREATE INDEX "sitemap_snapshots_tenantId_projectId_importedAt_idx" ON "sitemap_snapshots"("tenantId", "projectId", "importedAt");
ALTER TABLE "sitemap_snapshots" ADD CONSTRAINT "sitemap_snapshots_projectId_tenantId_fkey" FOREIGN KEY ("projectId", "tenantId") REFERENCES "projects"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
