import { config } from "dotenv"
import { resolve } from "node:path"
config({ path: resolve(process.cwd(), "workers/.env") }); config({ path: resolve(process.cwd(), ".env") })
import { Worker } from "bullmq"
import pino from "pino"
import { startServiceHeartbeat } from "@seo/shared"
import { prisma } from "../apps/api/src/lib/prisma"
import { processCmsBatch } from "../apps/api/src/lib/cmsBatch"
import { getCmsRedisConnection, enqueueCmsBatch, closeCmsQueue } from "../apps/api/src/lib/cmsQueue"

const log = pino(), worker = new Worker<{ batchId: string }>("cms-corrections", job => processCmsBatch(job.data.batchId), { connection: getCmsRedisConnection(), concurrency: 1 })
const stopHeartbeat = startServiceHeartbeat(worker.client, "cms")
worker.on("error", error => log.error({ name: error.name }, "CMS worker error"))
worker.on("failed", job => log.error({ batchId: job?.data.batchId }, "CMS batch interrupted"))
let recovery: Promise<void> | undefined, stopping = false
async function recover() {
  if (recovery || stopping) return recovery
  recovery = recoverPending()
  try { await recovery } finally { recovery = undefined }
}
async function recoverPending() {
  try {
    const pending = await prisma.cmsBatch.findMany({ where: { OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseUntil: { lt: new Date() } }] }, orderBy: { createdAt: "asc" }, take: 100 })
    for (const batch of pending) {
      if (stopping) break
      // Expired RUNNING records may have a retained completed Redis job: execute recovery directly.
      if (batch.status === "RUNNING") await processCmsBatch(batch.id)
      else await enqueueCmsBatch(batch.id)
    }
  } catch { log.error("CMS recovery unavailable") }
}
const timer = setInterval(() => void recover(), 30_000)
void recover()
async function shutdown() {
  if (stopping) return
  stopping = true; clearInterval(timer)
  await stopHeartbeat(); await Promise.all([worker.close(), recovery]); await closeCmsQueue(); await prisma.$disconnect()
}
process.on("SIGTERM", () => void shutdown()); process.on("SIGINT", () => void shutdown())
