// Token-set helpers for highlighting matching tokens between BibTeX entries
// and CrossRef candidate titles.

export function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^\p{L}\p{N} ]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}
