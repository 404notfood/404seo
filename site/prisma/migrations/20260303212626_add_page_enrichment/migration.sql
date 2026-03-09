-- AlterTable
ALTER TABLE "audit_pages" ADD COLUMN     "hasRobotsTxt" BOOLEAN,
ADD COLUMN     "hasSitemap" BOOLEAN,
ADD COLUMN     "hasViewport" BOOLEAN,
ADD COLUMN     "lang" TEXT,
ADD COLUMN     "metaRobots" TEXT,
ADD COLUMN     "ogDescription" TEXT,
ADD COLUMN     "ogImage" TEXT,
ADD COLUMN     "ogTitle" TEXT,
ADD COLUMN     "ogType" TEXT,
ADD COLUMN     "wordCount" INTEGER;
