export interface LinkingAnchor {
  url: string
  text: string
  nofollow: boolean
  placement: "CONTENT" | "NAVIGATION" | "OTHER"
}

export interface LinkingTextBlock {
  text: string
  linkedTexts: string[]
  unlinkedTexts?: string[]
}

/** Plain text only, bounded during extraction. No HTML is retained. */
export interface LinkingPageData {
  version: 1
  links: LinkingAnchor[]
  blocks: LinkingTextBlock[]
  linksTruncated: boolean
  blocksTruncated: boolean
  pageNofollow?: boolean
}

export interface InternalLinkPageInput {
  url: string
  title: string | null
  h1: string[]
  statusCode: number | null
  isIndexable: boolean | null
  redirectUrl: string | null
  canonicalUrl: string | null
  lang: string | null
  internalLinkUrls: string[]
  internalLinks: number | null
  linkingData: unknown
}

export interface InternalLinkNode {
  url: string
  title: string
  incoming: number
  outgoing: number
  depth: number | null
  eligible: boolean
  exclusion: string | null
}

export interface InternalLinkSuggestion {
  sourceUrl: string
  sourceTitle: string
  targetUrl: string
  targetTitle: string
  anchor: string
  excerpt: string
  matchedTerms: string[]
  targetIncoming: number
}

export interface InternalAnchorIssue {
  sourceUrl: string
  targetUrl: string
  anchor: string
  reason: "EMPTY" | "GENERIC" | "NOFOLLOW"
}

export interface InternalLinkAnalysis {
  nodes: InternalLinkNode[]
  suggestions: InternalLinkSuggestion[]
  anchorIssues: InternalAnchorIssue[]
  summary: {
    pages: number
    edges: number
    withoutIncoming: number
    unreachable: number
    unknownTargets: number
    contextualPages: number
    anchorIssues: number
  }
  limits: { pages: boolean; links: boolean; content: boolean; suggestions: boolean }
}

export type InternalLinkView = "suggestions" | "pages" | "anchors"

export interface ProjectInternalLinks extends Omit<InternalLinkAnalysis, "nodes" | "suggestions" | "anchorIssues"> {
  audit: { id: string; completedAt: string | null; pageCount: number } | null
  nodes: InternalLinkNode[]
  suggestions: InternalLinkSuggestion[]
  anchorIssues: InternalAnchorIssue[]
  view: InternalLinkView
  page: number
  pageCount: number
  total: number
}
