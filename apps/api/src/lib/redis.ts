import { Queue } from "bullmq"
import IORedis from "ioredis"
import type { CrawlJobData } from "@seo/shared"

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  // BullMQ requiert maxRetriesPerRequest: null (pas undefined)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maxRetriesPerRequest: null as any,
}

export const crawlQueue = new Queue<CrawlJobData>("crawl", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
})

// Client Redis simple pour usage général (pas BullMQ)
export const redis = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  lazyConnect: true,
})
