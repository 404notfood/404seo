import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { Readable } from "node:stream"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { encryptStream, decryptFile, pgEnvironment } from "../deployment/backup.mjs"
import { checkProductionConfig } from "../deployment/preflight.mjs"

test("Encrypted backups: no plaintext archives, GCM authentication rejects tampering and wrong keys, credentials remain outside CLI args", async () => {
  const folder = await mkdtemp(join(tmpdir(), "seo404-backup-test-")), encrypted = join(folder, "backup.enc"), restored = join(folder, "restore.txt")
  const key = randomBytes(32), source = Buffer.from("private database and CMS configuration")
  try {
    await encryptStream(Readable.from([source]), encrypted, key)
    const bytes = await readFile(encrypted); assert.ok(!bytes.includes(source))
    await decryptFile(encrypted, restored, key); assert.deepEqual(await readFile(restored), source); await rm(restored)
    await assert.rejects(decryptFile(encrypted, restored, randomBytes(32)), /Authenticité/)
    bytes[22] ^= 1; await writeFile(encrypted, bytes)
    await assert.rejects(decryptFile(encrypted, restored, key), /Authenticité/)
    const env = pgEnvironment("postgresql://editor:private%40password@127.0.0.1:5432/seo?schema=public", {})
    assert.equal(env.PGPASSWORD, "private@password"); assert.equal(env.PGDATABASE, "seo"); assert.equal(env.PGCONNECT_TIMEOUT, "10")
  } finally { await rm(encrypted, { force: true }); await rm(restored, { force: true }); await (await import("node:fs/promises")).rmdir(folder) }
})
test("Production preflight rejects example secrets and exposed services, reports optional integrations without disclosing keys", () => {
  const secret = randomBytes(32).toString("hex"), env = { DATABASE_URL: "postgresql://seo:nonce-8432a07f@127.0.0.1:5432/seo", BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: "https://seo.404notfood.fr", NEXT_PUBLIC_APP_URL: "https://seo.404notfood.fr", NEXT_PUBLIC_API_URL: "https://seo.404notfood.fr", API_HOST: "127.0.0.1", API_PORT: "4000", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379" }
  assert.deepEqual(checkProductionConfig(env).errors, [])
  const invalid = checkProductionConfig({ ...env, API_HOST: "0.0.0.0", BETTER_AUTH_SECRET: "<openssl rand -base64 32>", REDIS_HOST: "public.example.com" })
  assert.ok(invalid.errors.length >= 3); assert.ok(!JSON.stringify(invalid).includes(secret))
  const unmanaged = checkProductionConfig({ ...env, ANTHROPIC_API_KEY: "private-fixture-key" })
  assert.ok(unmanaged.warnings.some(value => value.includes("Anthropic"))); assert.ok(!JSON.stringify(unmanaged).includes("private-fixture-key"))
})
