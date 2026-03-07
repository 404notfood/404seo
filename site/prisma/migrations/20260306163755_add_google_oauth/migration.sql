-- AlterTable
ALTER TABLE "gbp_listings" ADD COLUMN     "googleLocationName" TEXT,
ADD COLUMN     "googlePlaceId" TEXT,
ADD COLUMN     "isGoogleConnected" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "google_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_tenantId_key" ON "google_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "google_accounts_tenantId_idx" ON "google_accounts"("tenantId");

-- AddForeignKey
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
