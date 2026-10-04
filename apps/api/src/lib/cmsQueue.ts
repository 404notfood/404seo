import { Queue } from "bullmq"
export function getCmsRedisConnection() { return { host: process.env.REDIS_HOST || "localhost", port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined, maxRetriesPerRequest: null } }
let queue: Queue<{ batchId: string }> | undefined
export function cmsQueue() { return queue ??= new Queue<{ batchId: string }>("cms-corrections", { connection: { ...getCmsRedisConnection(), enableOfflineQueue: false } }) }
export async function enqueueCmsBatch(batchId: string) {
  const producer = cmsQueue(), previous = await producer.getJob(batchId)
  if (previous) {
    const state = await previous.getState()
    if (state === "failed") {
      try { await previous.retry("failed") }
      catch (error) { if (!["waiting", "active", "delayed", "completed"].includes(await previous.getState())) throw error }
      return
    }
    if (state !== "completed") return
    await previous.remove()
  }
  await producer.add("cms", { batchId }, { jobId: batchId, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 100, removeOnFail: 100 })
}
export async function closeCmsQueue() { const current = queue; queue = undefined; if (current) await current.close() }
