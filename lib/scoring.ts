// Title/author/year similarity scoring used to classify CrossRef candidates.

export type Verdict = "verified" | "likely" | "uncertain";

export type ScoredCandidate = {
  doi: string;
  title: string;
  container: string;
  authors: { given?: string; family?: string }[];
  year: number | null;
  type: string;
  crossrefScore: number;
  titleSim: number;
  authorOverlap: number;
  yearDiff: number | null;
  combined: number;
  verdict: Verdict;
};

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, " ") // strip HTML tags from CrossRef titles
    .replace(/[\s　]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "and", "or", "to", "for", "with", "from",
  "by", "as", "is", "at", "be", "are", "this", "that", "into", "via", "we",
  "our", "their", "its", "it", "but", "not", "than", "vs",
]);

export function tokenize(s: string): string[] {
  return normalizeTitle(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

/** Containment of the smaller token set inside the larger. */
export function containment(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

export function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  return Math.max(jaccard(ta, tb), containment(ta, tb) * 0.95);
}

export function authorOverlapScore(entryLasts: string[], candidate: { family?: string }[]): number {
  if (!entryLasts.length || !candidate.length) return 0;
  const e = new Set(entryLasts.map((s) => s.toLowerCase()));
  const c = new Set(candidate.map((a) => (a.family ?? "").toLowerCase()).filter(Boolean));
  let hit = 0;
  for (const x of e) if (c.has(x)) hit++;
  return hit / e.size;
}

export type EntryQuery = {
  title: string;
  authorLastNames: string[];
  year: number | null;
};

export function scoreCandidate(
  q: EntryQuery,
  cand: {
    DOI?: string;
    title?: string[];
    "container-title"?: string[];
    author?: { given?: string; family?: string }[];
    issued?: { "date-parts"?: number[][] };
    type?: string;
    score?: number;
  }
): ScoredCandidate | null {
  const doi = cand.DOI;
  if (!doi) return null;
  const title = cand.title?.[0] ?? "";
  const container = cand["container-title"]?.[0] ?? "";
  const authors = cand.author ?? [];
  const yearRaw = cand.issued?.["date-parts"]?.[0]?.[0];
  const year = typeof yearRaw === "number" ? yearRaw : null;

  const titleSim = titleSimilarity(q.title, title);
  const authorOverlap = authorOverlapScore(q.authorLastNames, authors);
  const yearDiff = q.year != null && year != null ? Math.abs(q.year - year) : null;

  const yearScore = yearDiff == null ? 0.5 : yearDiff === 0 ? 1 : yearDiff <= 1 ? 0.7 : yearDiff <= 3 ? 0.3 : 0;
  const combined = 0.65 * titleSim + 0.25 * authorOverlap + 0.1 * yearScore;

  let verdict: Verdict = "uncertain";
  if (titleSim >= 0.85 && authorOverlap > 0 && (yearDiff == null || yearDiff <= 1)) {
    verdict = "verified";
  } else if (titleSim >= 0.6 && authorOverlap > 0) {
    verdict = "likely";
  } else if (titleSim >= 0.9) {
    // Title almost identical even without author overlap (e.g. anonymous, missing data)
    verdict = "likely";
  }

  return {
    doi,
    title,
    container,
    authors,
    year,
    type: cand.type ?? "",
    crossrefScore: cand.score ?? 0,
    titleSim,
    authorOverlap,
    yearDiff,
    combined,
    verdict,
  };
}
