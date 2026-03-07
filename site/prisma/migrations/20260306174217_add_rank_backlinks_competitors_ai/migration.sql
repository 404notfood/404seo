-- CreateTable
CREATE TABLE "ranked_keywords" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "keyword" TEXT NOT NULL,
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "country" TEXT NOT NULL DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranked_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rank_history" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "position" INTEGER,
    "url" TEXT,
    "title" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlinks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "anchor" TEXT,
    "dofollow" BOOLEAN NOT NULL DEFAULT true,
    "domainRating" INTEGER,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backlinks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "domain" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_visibility_checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "mentioned" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER,
    "snippet" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_visibility_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ranked_keywords_tenantId_idx" ON "ranked_keywords"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ranked_keywords_tenantId_keyword_device_country_key" ON "ranked_keywords"("tenantId", "keyword", "device", "country");

-- CreateIndex
CREATE INDEX "rank_history_keywordId_idx" ON "rank_history"("keywordId");

-- CreateIndex
CREATE INDEX "rank_history_keywordId_checkedAt_idx" ON "rank_history"("keywordId", "checkedAt");

-- CreateIndex
CREATE INDEX "backlinks_tenantId_idx" ON "backlinks"("tenantId");

-- CreateIndex
CREATE INDEX "backlinks_tenantId_sourceDomain_idx" ON "backlinks"("tenantId", "sourceDomain");

-- CreateIndex
CREATE INDEX "competitors_tenantId_idx" ON "competitors"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_tenantId_domain_key" ON "competitors"("tenantId", "domain");

-- CreateIndex
CREATE INDEX "ai_visibility_checks_tenantId_idx" ON "ai_visibility_checks"("tenantId");

-- CreateIndex
CREATE INDEX "ai_visibility_checks_tenantId_engine_idx" ON "ai_visibility_checks"("tenantId", "engine");

-- AddForeignKey
ALTER TABLE "ranked_keywords" ADD CONSTRAINT "ranked_keywords_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_keywords" ADD CONSTRAINT "ranked_keywords_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_history" ADD CONSTRAINT "rank_history_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "ranked_keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlinks" ADD CONSTRAINT "backlinks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlinks" ADD CONSTRAINT "backlinks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_visibility_checks" ADD CONSTRAINT "ai_visibility_checks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
