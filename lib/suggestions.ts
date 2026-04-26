// Compute "actionable" metadata suggestions for an entry — i.e. recommended
// BibTeX fields where the current value is missing or differs meaningfully
// from CrossRef's record.

import { RECOMMENDED_FIELDS, isFieldMissing, suggestFromWork } from "@/lib/fields";
import type { FieldName } from "@/lib/fields";
import type { EntryState } from "@/lib/state";

export type FieldSuggestion = {
  field: FieldName;
  current: string;
  suggested: string;
};

export function computeSuggestions(state: EntryState): FieldSuggestion[] {
  const work = state.meta?.work;
  if (!work) return [];
  const recommended = RECOMMENDED_FIELDS[state.entry.type] ?? [];
  if (recommended.length === 0) return [];
  const suggested = suggestFromWork(state.entry.type, work);
  const out: FieldSuggestion[] = [];
  for (const f of recommended) {
    const cur = state.entry.fields[f] ?? "";
    const cand = suggested[f];
    if (!cand) continue;
    if (isFieldMissing(cur)) {
      out.push({ field: f, current: cur, suggested: cand });
      continue;
    }
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    if (norm(cur) !== norm(cand)) {
      out.push({ field: f, current: cur, suggested: cand });
    }
  }
  return out;
}

/** Decision counts for an entry's metadata suggestions. */
export function suggestionStatus(state: EntryState): {
  total: number;
  decided: number;
  accepted: number;
  skipped: number;
} {
  const sugs = computeSuggestions(state);
  let accepted = 0;
  let skipped = 0;
  for (const s of sugs) {
    const fd = state.meta?.fields[s.field];
    if (!fd) continue;
    if (fd.kind === "accept") accepted++;
    else if (fd.kind === "skip") skipped++;
  }
  return { total: sugs.length, decided: accepted + skipped, accepted, skipped };
}
