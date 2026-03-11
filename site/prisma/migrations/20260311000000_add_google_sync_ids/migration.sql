-- AlterTable: Add googleReviewId to gbp_reviews for bidirectional sync
ALTER TABLE "gbp_reviews" ADD COLUMN "googleReviewId" TEXT;

-- CreateIndex: Unique constraint on googleReviewId
CREATE UNIQUE INDEX "gbp_reviews_googleReviewId_key" ON "gbp_reviews"("googleReviewId");

-- AlterTable: Add googlePostName to gbp_posts for bidirectional sync
ALTER TABLE "gbp_posts" ADD COLUMN "googlePostName" TEXT;

-- CreateIndex: Unique constraint on googlePostName
CREATE UNIQUE INDEX "gbp_posts_googlePostName_key" ON "gbp_posts"("googlePostName");
