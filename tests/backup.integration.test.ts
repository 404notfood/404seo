import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { mkdtemp, writeFile, readFile, readdir, rm, rmdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { backup, restoreDrill } from "../deployment/backup.mjs"

test("Backup recovery: real PostgreSQL encrypted dump and restore into an empty isolated database, never production", { skip: !process.env.TEST_DATABASE_URL || !process.env.PG_DUMP_BIN || !process.env.PG_RESTORE_BIN || !process.env.PSQL_BIN }, async () => {
  const source = new URL(process.env.TEST_DATABASE_URL!); assert.equal(source.hostname, "127.0.0.1"); assert.equal(source.port, "55432"); assert.equal(source.pathname, "/seo_security_audit")
  const { PrismaClient } = await import("@prisma/client"), prisma = new PrismaClient({ datasources: { db: { url: source.href } } })
  const folder = await mkdtemp(join(tmpdir(), "seo404-restore-test-")), name = "seo_restore_" + randomBytes(8).toString("hex")
  assert.match(name, /^seo_restore_[a-f0-9]{16}$/)
  const target = new URL(source.href); target.pathname = "/" + name
  const envFile = join(folder, "configuration.env"), backups = join(folder, "backups")
  await writeFile(envFile, "CMS_CREDENTIAL_KEY=" + randomBytes(32).toString("hex") + "\n", { mode: 0o600 })
  const env = { ...process.env, DATABASE_URL: source.href, RESTORE_DATABASE_URL: target.href, BACKUP_DIR: backups, BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex") }
  let destination: InstanceType<typeof PrismaClient> | undefined, archive: string | undefined
  try {
    await prisma.$executeRawUnsafe('CREATE DATABASE "' + name + '"')
    archive = await backup(env, envFile)
    const result = await restoreDrill(env, archive); assert.equal(result.migrations, 29); assert.equal(result.configurationVerified, true)
    destination = new PrismaClient({ datasources: { db: { url: target.href } } })
    assert.equal(await destination.$queryRawUnsafe<Array<{ count: bigint }>>('SELECT COUNT(*) AS count FROM "_prisma_migrations"').then(rows => Number(rows[0].count)), 29)
    await assert.rejects(restoreDrill(env, archive), /doit être vide/)
    await assert.rejects(restoreDrill({ ...env, RESTORE_DATABASE_URL: source.href }, archive), /seo_restore/)
    const data = await readFile(join(archive, "database.dump.enc")); assert.ok(!data.includes(Buffer.from("CREATE TABLE")))
  } finally {
    await destination?.$disconnect(); await prisma.$executeRawUnsafe('DROP DATABASE IF EXISTS "' + name + '"'); await prisma.$disconnect()
    if (archive) { for (const file of await readdir(archive)) await rm(join(archive, file)); await rmdir(archive) }
    await rm(envFile); if (archive) await rmdir(backups); await rmdir(folder)
  }
})
