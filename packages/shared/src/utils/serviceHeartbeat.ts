interface HeartbeatClient {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>
  del(key: string): Promise<unknown>
}
export function startServiceHeartbeat(client: Promise<HeartbeatClient>, service: "crawl" | "scheduler" | "cms") {
  const key = "seo404:heartbeat:" + service
  let stopped = false
  const ping = async () => { try { const redis = await client; if (!stopped) await redis.set(key, new Date().toISOString(), { EX: 60 }) } catch { /* Readiness will expire if Redis or this worker is unavailable. */ } }
  const timer = setInterval(() => void ping(), 15_000)
  timer.unref(); void ping()
  return async () => { stopped = true; clearInterval(timer); try { await (await client).del(key) } catch { /* TTL bounds shutdown leftovers. */ } }
}
