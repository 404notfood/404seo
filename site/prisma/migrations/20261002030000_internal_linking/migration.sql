-- Nullable evidence keeps historical audits usable without inventing anchor data.
ALTER TABLE "audit_pages" ADD COLUMN "linkingData" JSONB;
