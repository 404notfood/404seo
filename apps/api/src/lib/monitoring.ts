// lib/monitoring.ts — Monitoring d'erreurs lightweight
// Envoie les erreurs à Sentry via HTTP (pas de SDK npm nécessaire)
// Ou log structuré si SENTRY_DSN non configuré

const SENTRY_DSN = () => process.env.SENTRY_DSN || ""
const APP_ENV = () => process.env.NODE_ENV || "development"

interface ErrorContext {
  route?: string
  userId?: string
  tenantId?: string
  extra?: Record<string, unknown>
}

/**
 * Capture une erreur et l'envoie à Sentry (si configuré) ou la log
 */
export async function captureError(error: Error | unknown, context?: ErrorContext): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error))
  const dsn = SENTRY_DSN()

  // Toujours logger en JSON structuré
  console.error(JSON.stringify({
    level: "error",
    message: err.message,
    stack: err.stack,
    ...context,
    timestamp: new Date().toISOString(),
  }))

  if (!dsn) return

  try {
    // Parser le DSN Sentry : https://{key}@{host}/{project_id}
    const url = new URL(dsn)
    const key = url.username
    const projectId = url.pathname.replace("/", "")
    const sentryUrl = `https://${url.host}/api/${projectId}/store/`

    await fetch(sentryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}`,
      },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        platform: "node",
        level: "error",
        server_name: "seo-api",
        environment: APP_ENV(),
        exception: {
          values: [{
            type: err.name,
            value: err.message,
            stacktrace: err.stack ? {
              frames: err.stack.split("\n").slice(1).map((line) => {
                const match = line.match(/at (.+) \((.+):(\d+):(\d+)\)/)
                if (match) {
                  return {
                    function: match[1],
                    filename: match[2],
                    lineno: parseInt(match[3]),
                    colno: parseInt(match[4]),
                  }
                }
                return { function: line.trim() }
              }),
            } : undefined,
          }],
        },
        tags: {
          route: context?.route,
        },
        user: context?.userId ? { id: context.userId } : undefined,
        extra: {
          tenantId: context?.tenantId,
          ...context?.extra,
        },
      }),
    }).catch(() => {
      // Silencieux si Sentry est injoignable
    })
  } catch {
    // Ne pas crasher si le monitoring échoue
  }
}

/**
 * Capture un message (info/warning) dans Sentry
 */
export async function captureMessage(message: string, level: "info" | "warning" = "info"): Promise<void> {
  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString() }))

  const dsn = SENTRY_DSN()
  if (!dsn) return

  try {
    const url = new URL(dsn)
    const key = url.username
    const projectId = url.pathname.replace("/", "")
    const sentryUrl = `https://${url.host}/api/${projectId}/store/`

    await fetch(sentryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}`,
      },
      body: JSON.stringify({
        event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(),
        platform: "node",
        level,
        server_name: "seo-api",
        environment: APP_ENV(),
        message: { formatted: message },
      }),
    }).catch(() => {})
  } catch {
    // Silencieux
  }
}
