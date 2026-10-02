-- Retain audit history and quota usage when the owner removes a project.
ALTER TABLE "projects" ADD COLUMN "deletedAt" TIMESTAMP(3);
