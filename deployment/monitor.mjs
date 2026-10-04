import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile, readdir, stat } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "dotenv"
import { PrismaClient } from "@prisma/client"

const execute = promisify(execFile), ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export async function monitor(env) {
  const failures = []
  try {
    const response = await fetch("http://127.0.0.1:4000/health/ready", { redirect: "error", signal: AbortSignal.timeout(5000) })
    if (!response.ok) failures.push("API, PostgreSQL, Redis ou heartbeat d’un worker indisponible")
  } catch { failures.push("API locale inaccessible") }
  try {
    // pm2 jlist includes environment secrets: inspect it in memory and never print the raw response.
    const { stdout } = await execute("pm2", ["jlist"], { timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })
    const apps = JSON.parse(stdout)
    for (const name of ["404seo-site", "404seo-api", "404seo-worker", "404seo-scheduler", "404seo-cms-worker"]) if (!apps.some(app => app.name === name && app.pm2_env?.status === "online")) failures.push("Processus PM2 absent ou arrêté : " + name)
  } catch { failures.push("État PM2 indisponible") }
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })
  try {
    const now = new Date(), old = new Date(Date.now() - 10 * 60_000)
    const overdue = await prisma.cmsBatch.count({ where: { OR: [{ status: "QUEUED", createdAt: { lt: old } }, { status: "RUNNING", leaseUntil: { lt: now } }] } })
    if (overdue) failures.push(overdue + " lots CMS attendent une reprise")
    const uncertain = await prisma.cmsCorrection.count({ where: { status: "UNCERTAIN" } })
    if (uncertain) failures.push(uncertain + " publications CMS nécessitent une vérification")
  } catch { failures.push("Contrôle des opérations PostgreSQL indisponible") } finally { await prisma.$disconnect() }
  try {
    const names = await readdir(env.BACKUP_DIR), dates = []
    for (const name of names) {
      if (!/^\d{4}-\d{2}-\d{2}T[0-9Z-]+-[a-f0-9]{8}$/.test(name)) continue
      try {
        const folder = join(env.BACKUP_DIR, name), manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8"))
        if (manifest.version !== 1) continue
        const files = await Promise.all(["database.dump.enc", "configuration.env.enc"].map(file => stat(join(folder, file))))
        const date = Date.parse(manifest.createdAt)
        if (Number.isFinite(date) && files.every(file => file.isFile() && file.size > 36)) dates.push(date)
      } catch { /* Partial backups have no usable manifest. */ }
    }
    if (!dates.length || Math.max(...dates) < Date.now() - 26 * 3600_000) failures.push("Aucune sauvegarde complète de moins de 26 heures")
  } catch { failures.push("Répertoire de sauvegarde inaccessible") }
  return { status: failures.length ? "attention" : "ok", checkedAt: new Date().toISOString(), failures }
}
async function main() {
  try {
    const env = { ...process.env, ...parse(await readFile(join(ROOT, ".env.production"))) }, result = await monitor(env)
    if (result.failures.length) { console.error(JSON.stringify(result)); process.exitCode = 1 }
    else if (!process.argv.includes("--quiet")) console.log(JSON.stringify(result))
  } catch { console.error("Contrôle de production impossible : configuration manquante ou illisible."); process.exitCode = 1 }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
