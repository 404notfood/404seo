// packages/shared/src/keywords.ts — Extraction et agrégation de mots-clés

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface KeywordEntry {
  term: string
  count: number
  score: number
  positions: string[] // "title", "h1", "h2", "h3", "meta", "body"
}

export interface SiteKeywordEntry {
  term: string
  totalCount: number
  pageCount: number
  avgScore: number
  positions: string[]
  topPages: { url: string; count: number }[]
}

export interface SiteKeywords {
  keywords: SiteKeywordEntry[]
  totalPages: number
}

// ─────────────────────────────────────────────
// Stop Words FR + EN
// ─────────────────────────────────────────────

const STOP_WORDS_FR = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "au", "aux",
  "ce", "ces", "cet", "cette", "mon", "ton", "son", "ma", "ta", "sa",
  "mes", "tes", "ses", "nos", "vos", "leur", "leurs", "qui", "que",
  "quoi", "dont", "est", "sont", "suis", "sommes", "etes", "ont",
  "fait", "faire", "dit", "dire", "peut", "pour", "par", "sur",
  "dans", "avec", "sans", "mais", "donc", "car", "pas", "plus",
  "moins", "tout", "tous", "toute", "toutes", "ici", "aussi",
  "bien", "mal", "peu", "trop", "tres", "comme", "entre", "vers",
  "chez", "sous", "apres", "avant", "pendant", "depuis", "encore",
  "jamais", "toujours", "souvent", "parfois", "vous", "nous", "ils",
  "elles", "elle", "lui", "moi", "toi", "soi", "cela", "ceci",
  "autre", "autres", "meme", "chaque", "quel", "quelle", "quels",
  "quelles", "avoir", "etre", "sera", "serait", "etait", "avait",
  "quand", "alors", "ainsi", "non", "oui", "bon", "bonne",
])

const STOP_WORDS_EN = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can",
  "had", "her", "was", "one", "our", "out", "has", "his", "how",
  "its", "may", "new", "now", "old", "see", "way", "who", "did",
  "get", "let", "say", "she", "too", "use", "been", "call", "each",
  "from", "have", "into", "just", "like", "long", "make", "many",
  "more", "much", "must", "name", "only", "over", "such", "take",
  "than", "that", "them", "then", "they", "this", "very", "when",
  "what", "were", "will", "with", "your", "about", "after", "being",
  "could", "every", "first", "great", "here", "just", "most", "other",
  "some", "still", "their", "there", "these", "think", "those",
  "through", "under", "where", "which", "while", "would", "should",
  "also", "does", "done", "down", "even", "find", "give", "good",
  "help", "home", "keep", "last", "look", "made", "need", "next",
  "part", "same", "want", "well", "work", "back", "come", "know",
])

const ALL_STOP_WORDS = new Set([...STOP_WORDS_FR, ...STOP_WORDS_EN])

// ─────────────────────────────────────────────
// Tokenize
// ─────────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 3 && !ALL_STOP_WORDS.has(t) && !/^\d+$/.test(t))
}

// ─────────────────────────────────────────────
// N-grams
// ─────────────────────────────────────────────

export function generateNgrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = []
  for (let i = 0; i <= tokens.length - n; i++) {
    const slice = tokens.slice(i, i + n)
    // Reject if any token is a stop word
    if (slice.some((t) => ALL_STOP_WORDS.has(t))) continue
    ngrams.push(slice.join(" "))
  }
  return ngrams
}

// ─────────────────────────────────────────────
// Positional Boost
// ─────────────────────────────────────────────

const POSITION_BOOST: Record<string, number> = {
  title: 8,
  h1: 6,
  h2: 4,
  h3: 2,
  meta: 3,
  body: 1,
}

// ─────────────────────────────────────────────
// Extract Page Keywords (top 20)
// ─────────────────────────────────────────────

export function extractPageKeywords(
  title: string | undefined,
  h1: string[],
  headings: { h2: string[]; h3: string[] },
  metaDescription: string | undefined,
  bodyText: string
): KeywordEntry[] {
  const termMap = new Map<string, { count: number; score: number; positions: Set<string> }>()

  function processPart(text: string, position: string) {
    const tokens = tokenize(text)
    const boost = POSITION_BOOST[position] ?? 1

    // Unigrams
    for (const token of tokens) {
      const entry = termMap.get(token) ?? { count: 0, score: 0, positions: new Set() }
      entry.count++
      entry.score += boost
      entry.positions.add(position)
      termMap.set(token, entry)
    }

    // Bigrams
    for (const ngram of generateNgrams(tokens, 2)) {
      const entry = termMap.get(ngram) ?? { count: 0, score: 0, positions: new Set() }
      entry.count++
      entry.score += boost
      entry.positions.add(position)
      termMap.set(ngram, entry)
    }

    // Trigrams
    for (const ngram of generateNgrams(tokens, 3)) {
      const entry = termMap.get(ngram) ?? { count: 0, score: 0, positions: new Set() }
      entry.count++
      entry.score += boost
      entry.positions.add(position)
      termMap.set(ngram, entry)
    }
  }

  if (title) processPart(title, "title")
  for (const h of h1) processPart(h, "h1")
  for (const h of headings.h2) processPart(h, "h2")
  for (const h of headings.h3) processPart(h, "h3")
  if (metaDescription) processPart(metaDescription, "meta")
  processPart(bodyText, "body")

  return [...termMap.entries()]
    .map(([term, data]) => ({
      term,
      count: data.count,
      score: Math.round(data.score * 100) / 100,
      positions: [...data.positions],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
}

// ─────────────────────────────────────────────
// Aggregate Site Keywords (top 30)
// ─────────────────────────────────────────────

export function aggregateSiteKeywords(
  pages: { url: string; topKeywords: KeywordEntry[] }[],
  totalPages: number
): SiteKeywords {
  const termMap = new Map<string, {
    totalCount: number
    totalScore: number
    pages: Map<string, number> // url → count
    positions: Set<string>
  }>()

  for (const page of pages) {
    for (const kw of page.topKeywords) {
      const entry = termMap.get(kw.term) ?? {
        totalCount: 0,
        totalScore: 0,
        pages: new Map(),
        positions: new Set(),
      }
      entry.totalCount += kw.count
      entry.totalScore += kw.score
      entry.pages.set(page.url, (entry.pages.get(page.url) ?? 0) + kw.count)
      for (const p of kw.positions) entry.positions.add(p)
      termMap.set(kw.term, entry)
    }
  }

  const keywords = [...termMap.entries()]
    .map(([term, data]) => {
      const pageCount = data.pages.size
      // IDF simplifié : pénalise les termes présents sur toutes les pages (navigation)
      const idf = Math.log(totalPages / (pageCount + 1))
      const avgScore = (data.totalScore / pageCount) * Math.max(idf, 0.1)

      const topPages = [...data.pages.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([url, count]) => ({ url, count }))

      return {
        term,
        totalCount: data.totalCount,
        pageCount,
        avgScore: Math.round(avgScore * 100) / 100,
        positions: [...data.positions],
        topPages,
      }
    })
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 30)

  return { keywords, totalPages }
}
