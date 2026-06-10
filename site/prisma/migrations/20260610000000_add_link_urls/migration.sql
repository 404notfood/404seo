-- AlterTable
ALTER TABLE "audit_pages" ADD COLUMN     "internalLinkUrls" TEXT[],
ADD COLUMN     "externalLinkUrls" TEXT[];
