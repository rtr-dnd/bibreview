// Shared API types between client and server.

import type { ScoredCandidate } from "@/lib/scoring";

export type ParsedEntry = {
  key: string;
  type: string;
  fields: Record<string, string>;
  raw: string;
  existingDoi: string | null;
};

export type ParseResponse = {
  source: string;
  entries: ParsedEntry[];
  stats: { total: number; withDoi: number; missing: number };
};

export type SearchRequest = {
  title: string;
  author: string;
  year: number | null;
};

export type SearchResponse = {
  candidates: ScoredCandidate[];
};

export type ExportRequest = {
  source: string;
  /** entry key -> { doi?, journal?, ... } */
  edits: Record<string, Record<string, string | null | undefined>>;
};

export type ExportResponse = {
  bib: string;
};
