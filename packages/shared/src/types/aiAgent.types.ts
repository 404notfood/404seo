export interface AiChatMessage { role: "user" | "assistant"; content: string }
export interface AiUsageSummary {
  configured: boolean
  allowed: boolean
  used: number
  quota: number
  committedUsd: number
  measuredUsd: number
  uncertainRequests: number
  budgetUsd: number
  nextRequestUsd: number | null
}
export interface AiAgentReply { content: string; auditId: string; auditedAt: string; usage: AiUsageSummary }
