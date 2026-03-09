-- AlterTable
ALTER TABLE "audit_pages" ADD COLUMN     "hasResponsiveMeta" BOOLEAN,
ADD COLUMN     "smallFontSizes" INTEGER,
ADD COLUMN     "smallTapTargets" INTEGER;

-- AlterTable
ALTER TABLE "audits" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "audits_tenantId_status_idx" ON "audits"("tenantId", "status");

-- CreateIndex
CREATE INDEX "page_results_pageId_status_idx" ON "page_results"("pageId", "status");
