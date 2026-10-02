export interface CmsResource {
  id: number
  url: string
  title: string
  kind: "post" | "page" | "product"
  content: string
  seoTitle: string | null
  seoDescription: string | null
  revision: string
}

export interface CmsConnectionSummary {
  id: string
  siteUrl: string
  label: string
  provider: "WORDPRESS" | "PRESTASHOP"
  scope: string
  verifiedAt: string
}

export type CmsCorrectionStatus = "GENERATING" | "DRAFT" | "APPLYING" | "APPLIED" | "RESTORING" | "RESTORED" | "CONFLICT" | "FAILED" | "UNCERTAIN"
export interface CmsCorrectionSummary {
  id: string
  connectionId: string
  resourceId: number
  resourceUrl: string
  title: string
  mode: "SEO" | "SPELLING"
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
  access: { connect: boolean; generate: boolean; publish: boolean; configured: boolean; aiConfigured: boolean; quota: number; used: number }
}

export interface ConnectWordPressInput { siteUrl: string; username: string; applicationPassword: string }
export interface ConnectPrestaShopInput { provider: "PRESTASHOP"; siteUrl: string; token: string }
