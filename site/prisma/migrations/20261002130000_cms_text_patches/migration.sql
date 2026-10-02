ALTER TABLE "cms_corrections" ADD COLUMN "beforePatchesJson" TEXT NOT NULL DEFAULT '[]', ADD COLUMN "afterPatchesJson" TEXT NOT NULL DEFAULT '[]';
