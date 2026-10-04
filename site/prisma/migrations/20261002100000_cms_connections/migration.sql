ALTER TABLE "plan_configs" ADD COLUMN "featureCmsCorrections" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cmsMonthlyQuota" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "plan_configs" ADD CONSTRAINT "cms_quota_non_negative" CHECK ("cmsMonthlyQuota" BETWEEN 0 AND 1000000);
CREATE TABLE "cms_connections" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'WORDPRESS', "siteUrl" TEXT NOT NULL, "label" TEXT NOT NULL,
  "credentials" TEXT NOT NULL, "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "disconnectedAt" TIMESTAMP(3),
  CONSTRAINT "cms_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cms_connections_projectId_tenantId_fkey" FOREIGN KEY ("projectId", "tenantId")
    REFERENCES "projects" ("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cms_connections_id_tenantId_key" ON "cms_connections" ("id", "tenantId");
CREATE INDEX "cms_connections_tenantId_projectId_idx" ON "cms_connections" ("tenantId", "projectId");
CREATE UNIQUE INDEX "cms_one_active_connection" ON "cms_connections" ("projectId", "tenantId") WHERE "disconnectedAt" IS NULL;
CREATE TABLE "cms_corrections" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "connectionId" TEXT NOT NULL,
  "resourceId" INTEGER NOT NULL, "resourceUrl" TEXT NOT NULL, "title" TEXT NOT NULL, "mode" TEXT NOT NULL,
  "beforeTitle" TEXT, "beforeDescription" TEXT, "afterTitle" TEXT, "afterDescription" TEXT, "reason" TEXT,
  "beforeRevision" TEXT NOT NULL, "appliedRevision" TEXT, "status" TEXT NOT NULL DEFAULT 'GENERATING', "direction" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cms_corrections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cms_corrections_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId")
    REFERENCES "cms_connections" ("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cms_corrections_tenantId_createdAt_idx" ON "cms_corrections" ("tenantId", "createdAt");
CREATE INDEX "cms_corrections_connectionId_status_idx" ON "cms_corrections" ("connectionId", "status");
