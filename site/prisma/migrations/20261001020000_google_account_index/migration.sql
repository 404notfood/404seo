-- The historical migration removed a constraint, but Prisma created a unique index.
-- Preserve accounts and allow the documented multiple accounts per tenant.
DROP INDEX IF EXISTS "google_accounts_tenantId_key";
