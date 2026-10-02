import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { readFile, writeFile, mkdir, stat, appendFile, rm, mkdtemp, open, rmdir, realpath } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { resolve, dirname, join, isAbsolute, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "dotenv"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."), MAGIC = Buffer.from("SEO404B1")
function key(env) { if (!/^[a-f0-9]{64}$/i.test(env.BACKUP_ENCRYPTION_KEY ?? "")) throw new Error("Clé de sauvegarde absente ou invalide"); return Buffer.from(env.BACKUP_ENCRYPTION_KEY, "hex") }
function inside(parent, child) { const path = relative(parent, child); return path === "" || path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path) }
export function pgEnvironment(databaseUrl, env) {
  const url = new URL(databaseUrl)
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.pathname.slice(1)) throw new Error("Adresse PostgreSQL invalide")
  return { ...env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: url.searchParams.get("sslmode") || "prefer", PGCONNECT_TIMEOUT: "10" }
}
function run(binary, args, env) {
  const child = spawn(binary, args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
  // Do not echo PostgreSQL stderr, which may contain connection details.
  child.stderr.resume()
  const finished = new Promise((accept, reject) => { child.on("error", () => reject(new Error("Outil PostgreSQL indisponible"))); child.on("close", code => code === 0 ? accept() : reject(new Error("Opération PostgreSQL non confirmée"))) })
  finished.catch(() => {})
  return { child, finished }
}
export async function encryptStream(stream, file, encryptionKey) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey, iv)
  cipher.setAAD(MAGIC)
  await writeFile(file, Buffer.concat([MAGIC, iv]), { flag: "wx", mode: 0o600 })
  await pipeline(stream, cipher, createWriteStream(file, { flags: "a", mode: 0o600 }))
  await appendFile(file, cipher.getAuthTag())
}
async function digest(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex") }
export async function decryptFile(file, destination, encryptionKey) {
  const info = await stat(file); if (info.size < 36) throw new Error("Sauvegarde tronquée")
  const handle = await open(file, "r"), header = { prefix: Buffer.alloc(20), tag: Buffer.alloc(16) }
  try { await handle.read(header.prefix, 0, 20, 0); await handle.read(header.tag, 0, 16, info.size - 16) } finally { await handle.close() }
  if (!header.prefix.subarray(0, 8).equals(MAGIC)) throw new Error("Format de sauvegarde invalide")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, header.prefix.subarray(8, 20)); decipher.setAAD(MAGIC); decipher.setAuthTag(header.tag)
  try { await pipeline(createReadStream(file, { start: 20, end: info.size - 17 }), decipher, createWriteStream(destination, { flags: "wx", mode: 0o600 })) }
  catch { await rm(destination, { force: true }); throw new Error("Authenticité de la sauvegarde non confirmée") }
}
export async function backup(env, envFile) {
  const encryptionKey = key(env)
  if (env.BACKUP_ENCRYPTION_KEY === env.CMS_CREDENTIAL_KEY) throw new Error("Utilisez une clé de sauvegarde distincte de la clé CMS")
  if (!env.BACKUP_DIR || !isAbsolute(env.BACKUP_DIR)) throw new Error("BACKUP_DIR doit être un chemin absolu hors du projet et du répertoire public")
  let base = resolve(env.BACKUP_DIR)
  if (inside(ROOT, base) || inside(base, ROOT) || /(?:^|[\\/])(?:public_html|public_shtml)(?:[\\/]|$)/i.test(base)) throw new Error("Répertoire de sauvegarde non autorisé")
  await mkdir(base, { recursive: true, mode: 0o700 }); base = await realpath(base)
  if (inside(ROOT, base) || inside(base, ROOT) || /(?:^|[\\/])(?:public_html|public_shtml)(?:[\\/]|$)/i.test(base)) throw new Error("Répertoire de sauvegarde non autorisé")
  if (process.platform !== "win32" && ((await stat(base)).mode & 0o077)) throw new Error("Le répertoire de sauvegarde doit être privé (chmod 700)")
  const folder = join(base, new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(4).toString("hex"))
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const dump = run(env.PG_DUMP_BIN || "pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--compress=6"], pgEnvironment(env.DATABASE_URL, env))
  dump.child.stdin.end()
  try {
    await Promise.all([encryptStream(dump.child.stdout, join(folder, "database.dump.enc"), encryptionKey), dump.finished])
    await encryptStream(Readable.from([await readFile(envFile)]), join(folder, "configuration.env.enc"), encryptionKey)
    const files = {}
    for (const name of ["database.dump.enc", "configuration.env.enc"]) files[name] = { sha256: await digest(join(folder, name)), bytes: (await stat(join(folder, name))).size }
    await writeFile(join(folder, "manifest.json"), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files, coverage: "PostgreSQL et configuration de production. Le code est récupéré depuis Git ; les files Redis sont reprises depuis les états PostgreSQL." }, null, 2), { flag: "wx", mode: 0o600 })
    return folder
  } catch { dump.child.kill(); throw new Error("Sauvegarde incomplète : aucun manifeste valide n’a été produit") }
}
export async function restoreDrill(env, folder) {
  const encryptionKey = key(env), target = new URL(env.RESTORE_DATABASE_URL)
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || !/^\/seo_restore_[a-z0-9_]+$/.test(target.pathname)) throw new Error("Le test de restauration exige une base locale dédiée seo_restore_…")
  if (target.pathname === new URL(env.DATABASE_URL).pathname) throw new Error("La base cible doit être distincte de la production")
  const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8"))
  if (manifest.version !== 1 || !manifest.files) throw new Error("Manifeste invalide")
  for (const name of ["database.dump.enc", "configuration.env.enc"]) {
    const entry = manifest.files[name], file = join(folder, name)
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256) || (await stat(file)).size !== entry.bytes || await digest(file) !== entry.sha256) throw new Error("Sauvegarde altérée ou incomplète")
  }
  const directory = await mkdtemp(join(tmpdir(), "seo404-restore-")), database = join(directory, "database.dump"), config = join(directory, "configuration.env")
  try {
    // Authenticate the entire archive before giving any byte to pg_restore.
    await decryptFile(join(folder, "database.dump.enc"), database, encryptionKey)
    await decryptFile(join(folder, "configuration.env.enc"), config, encryptionKey)
    const pgEnv = pgEnvironment(env.RESTORE_DATABASE_URL, env)
    const check = run(env.PSQL_BIN || "psql", ["-X", "-A", "-t", "-c", "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')"], pgEnv)
    check.child.stdin.end(); let tables = ""; check.child.stdout.on("data", chunk => { tables += chunk.toString() })
    await check.finished; if (tables.trim() !== "0") throw new Error("La base de restauration doit être vide")
    const restore = run(env.PG_RESTORE_BIN || "pg_restore", ["--no-owner", "--no-acl", "--single-transaction", "--exit-on-error", "--dbname", pgEnv.PGDATABASE, database], pgEnv)
    restore.child.stdin.end(); restore.child.stdout.resume(); await restore.finished
    const verify = run(env.PSQL_BIN || "psql", ["-X", "-A", "-t", "-c", "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL"], pgEnv)
    verify.child.stdin.end(); let migrations = ""; verify.child.stdout.on("data", chunk => { migrations += chunk.toString() }); await verify.finished
    if (!/^\d+$/.test(migrations.trim()) || Number(migrations.trim()) === 0) throw new Error("La restauration ne contient pas de migrations vérifiables")
    return { migrations: Number(migrations.trim()), configurationVerified: true }
  } finally { await rm(database, { force: true }); await rm(config, { force: true }); await rmdir(directory) }
}
async function main() {
  try {
    const envFile = join(ROOT, ".env.production"), env = { ...process.env, ...parse(await readFile(envFile)) }
    if (process.argv[2] === "create") console.log("Sauvegarde chiffrée créée : " + await backup(env, envFile))
    else if (process.argv[2] === "restore-drill" && process.argv[3]) console.log("Restauration vérifiée : " + JSON.stringify(await restoreDrill(env, resolve(process.argv[3]))))
    else throw new Error("Usage : node deployment/backup.mjs create | restore-drill CHEMIN_SAUVEGARDE")
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
