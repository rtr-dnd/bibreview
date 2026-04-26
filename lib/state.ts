// Shared client-side state types used by Reviewer and persisted to localStorage.

import type { CrossrefItem } from "@/lib/crossref";
import type { ScoredCandidate } from "@/lib/scoring";
import type { ParsedEntry } from "@/lib/types";
import type { FieldName } from "@/lib/fields";

export type Decision =
  | { kind: "pending" }
  | { kind: "had-doi"; doi: string }
  | { kind: "doi"; doi: string; from: "candidate" | "manual" }
  | { kind: "skip" };

/** Per-field user decisions during the metadata step. */
export type FieldDecision =
  | { kind: "pending" }
  | { kind: "accept"; value: string }
  | { kind: "skip" };

export type MetaState = {
  fetched: boolean;
  fetching: boolean;
  error?: string;
  work?: CrossrefItem;
  fields: Partial<Record<FieldName, FieldDecision>>;
};

export type EntryState = {
  entry: ParsedEntry;
  candidates?: ScoredCandidate[];
  searching: boolean;
  searched: boolean;
  error?: string;
  decision: Decision;
  meta?: MetaState;
};

export type Step = "doi" | "metadata";

export type StoredMetaState = Omit<MetaState, "fetching">;
export type StoredEntry = Omit<EntryState, "searching" | "meta"> & {
  meta?: StoredMetaState;
};

export type StoredSession = {
  version: 2;
  filename: string;
  source: string;
  selectedKey: string | null;
  step: Step;
  entries: StoredEntry[];
};

/** Returns the resolved DOI for an entry if any (existing or accepted). */
export function resolvedDoi(s: EntryState): string | null {
  if (s.decision.kind === "had-doi" || s.decision.kind === "doi") return s.decision.doi;
  return null;
}
