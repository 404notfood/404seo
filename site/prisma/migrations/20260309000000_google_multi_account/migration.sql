-- Migration: google_multi_account
-- Passage de 1 GoogleAccount par tenant → N par tenant
-- Chaque GBPListing peut être liée à un GoogleAccount spécifique

-- 1. Supprimer la contrainte UNIQUE sur tenantId
ALTER TABLE "google_accounts" DROP CONSTRAINT IF EXISTS "google_accounts_tenantId_key";

-- 2. Ajouter la colonne label (libellé optionnel du compte)
ALTER TABLE "google_accounts" ADD COLUMN IF NOT EXISTS "label" TEXT;

-- 3. Ajouter googleAccountId sur gbp_listings
ALTER TABLE "gbp_listings" ADD COLUMN IF NOT EXISTS "googleAccountId" TEXT;

-- 4. Ajouter la foreign key
ALTER TABLE "gbp_listings" ADD CONSTRAINT "gbp_listings_googleAccountId_fkey"
  FOREIGN KEY ("googleAccountId") REFERENCES "google_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Index pour la recherche par googleAccountId
CREATE INDEX IF NOT EXISTS "gbp_listings_googleAccountId_idx" ON "gbp_listings"("googleAccountId");
