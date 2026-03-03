import { Queue } from "bullmq"
import type { CrawlJobData } from "@seo/shared"

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null as unknown as undefined,
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
