-- AlterTable
ALTER TABLE "ranked_keywords" ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastCheckMessage" TEXT,
ADD COLUMN     "lastCheckStatus" TEXT NOT NULL DEFAULT 'NEVER';

-- AlterTable
ALTER TABLE "rank_history" ADD COLUMN     "resultCount" INTEGER NOT NULL DEFAULT 0;

