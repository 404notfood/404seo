-- CreateEnum
CREATE TYPE "GBPStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "GBPReplyStatus" AS ENUM ('PENDING', 'REPLIED', 'IGNORED');

-- CreateEnum
CREATE TYPE "GBPSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "GBPPostType" AS ENUM ('UPDATE', 'EVENT', 'OFFER');

-- CreateEnum
CREATE TYPE "GBPPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "GBPPhotoType" AS ENUM ('LOGO', 'COVER', 'INTERIOR', 'EXTERIOR', 'PRODUCT', 'TEAM');

-- CreateTable
CREATE TABLE "gbp_listings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "openingHours" JSONB,
    "completionScore" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "GBPStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gbp_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gbp_reviews" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "replyText" TEXT,
    "replyStatus" "GBPReplyStatus" NOT NULL DEFAULT 'PENDING',
    "sentiment" "GBPSentiment",
    "aiSuggestedReply" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gbp_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gbp_posts" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "GBPPostType" NOT NULL DEFAULT 'UPDATE',
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "ctaType" TEXT,
    "ctaUrl" TEXT,
    "status" "GBPPostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gbp_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gbp_rankings" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "positions" JSONB NOT NULL,
    "avgRank" DOUBLE PRECISION NOT NULL,
    "bestRank" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gbp_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gbp_photos" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "GBPPhotoType" NOT NULL DEFAULT 'INTERIOR',
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gbp_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gbp_listings_tenantId_idx" ON "gbp_listings"("tenantId");

-- CreateIndex
CREATE INDEX "gbp_reviews_listingId_idx" ON "gbp_reviews"("listingId");

-- CreateIndex
CREATE INDEX "gbp_posts_listingId_idx" ON "gbp_posts"("listingId");

-- CreateIndex
CREATE INDEX "gbp_rankings_listingId_idx" ON "gbp_rankings"("listingId");

-- CreateIndex
CREATE INDEX "gbp_photos_listingId_idx" ON "gbp_photos"("listingId");

-- AddForeignKey
ALTER TABLE "gbp_listings" ADD CONSTRAINT "gbp_listings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbp_reviews" ADD CONSTRAINT "gbp_reviews_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "gbp_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbp_posts" ADD CONSTRAINT "gbp_posts_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "gbp_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbp_rankings" ADD CONSTRAINT "gbp_rankings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "gbp_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbp_photos" ADD CONSTRAINT "gbp_photos_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "gbp_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
