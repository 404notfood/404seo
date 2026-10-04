import type { AiUsageSummary } from "./aiAgent.types"
export type CmsCorrectionMode = "SEO" | "SPELLING" | "CONTENT" | "ALT"
export interface CmsTextPatch { id: string; text: string }
export interface CmsTextSegment extends CmsTextPatch { type: "CONTENT" | "ALT" }
export interface CmsResource {
  id: number
  url: string
  title: string
  kind: "post" | "page" | "product" | "category" | "cms"
  content: string
  seoTitle: string | null
  seoDescription: string | null
  revision: string
  segments?: CmsTextSegment[]
}

export interface CmsConnectionSummary {
  id: string
  siteUrl: string
  label: string
  provider: "WORDPRESS" | "PRESTASHOP"
  scope: string
  verifiedAt: string
}

export type CmsCorrectionStatus = "QUEUED" | "GENERATING" | "DRAFT" | "APPLYING" | "APPLIED" | "RESTORING" | "RESTORED" | "CONFLICT" | "FAILED" | "UNCERTAIN"
export interface CmsCorrectionSummary {
  id: string
  connectionId: string
  resourceId: number
  resourceUrl: string
  title: string
  mode: CmsCorrectionMode
  beforePatches: CmsTextPatch[]
  afterPatches: CmsTextPatch[]
  beforeTitle: string | null
  beforeDescription: string | null
  afterTitle: string | null
  afterDescription: string | null
  reason: string | null
  status: CmsCorrectionStatus
  direction: "APPLY" | "RESTORE" | null
  createdAt: string
}

export interface ProjectCms {
  connection: CmsConnectionSummary | null
  corrections: CmsCorrectionSummary[]
  batches: CmsBatchSummary[]
  aiUsage: AiUsageSummary
  access: { connect: boolean; generate: boolean; publish: boolean; configured: boolean; aiConfigured: boolean; quota: number; used: number }
}

export interface CmsBatchSummary {
  id: string
  action: "GENERATE" | "APPLY"
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "CANCELLED"
  total: number
  completed: number
  failed: number
  cancelRequested: boolean
  createdAt: string
}

export interface ConnectWordPressInput { siteUrl: string; username: string; applicationPassword: string }
export interface ConnectPrestaShopInput { provider: "PRESTASHOP"; siteUrl: string; token: string }
