// Maps BibTeX entry types to recommended fields, and maps CrossRef
// /works/{doi} responses into BibTeX field suggestions.

import type { CrossrefItem } from "@/lib/crossref";

export type FieldName =
  | "journal"
  | "booktitle"
  | "publisher"
  | "address"
  | "volume"
  | "number"
  | "pages"
  | "isbn"
  | "issn"
  | "series"
  | "editor";

/** Fields that BibTeX styles commonly warn about when missing per type. */
export const RECOMMENDED_FIELDS: Record<string, FieldName[]> = {
  article: ["journal", "volume", "number", "pages"],
  inproceedings: ["booktitle", "publisher", "address", "pages"],
  conference: ["booktitle", "publisher", "address", "pages"],
  incollection: ["booktitle", "publisher", "address", "pages", "editor"],
  inbook: ["publisher", "address", "pages"],
  book: ["publisher", "address", "isbn"],
  proceedings: ["publisher", "address"],
};

/** Suggest BibTeX field values from a CrossRef work record. */
export function suggestFromWork(
  entryType: string,
  work: CrossrefItem,
): Partial<Record<FieldName, string>> {
  const out: Partial<Record<FieldName, string>> = {};
  const t = entryType.toLowerCase();
  const container = work["container-title"]?.[0] ?? work["short-container-title"]?.[0];

  if (container) {
    if (t === "article") out.journal = container;
    else if (
      t === "inproceedings" ||
      t === "conference" ||
      t === "incollection" ||
      t === "inbook"
    ) {
      out.booktitle = container;
    }
  }
  if (work.publisher) out.publisher = work.publisher;
  if (work["publisher-location"]) out.address = work["publisher-location"];
  if (work.volume) out.volume = work.volume;
  if (work.issue) out.number = work.issue;
  if (work.page) out.pages = normalizePages(work.page);
  if (work.ISBN && work.ISBN.length > 0) out.isbn = work.ISBN[0];
  if (work.ISSN && work.ISSN.length > 0) out.issn = work.ISSN[0];
  if (work.editor && work.editor.length > 0) {
    out.editor = work.editor
      .map((e) => `${e.given ?? ""} ${e.family ?? ""}`.trim())
      .filter(Boolean)
      .join(" and ");
  }
  return out;
}

/** CrossRef returns "1-12" but BibTeX prefers "1--12". */
export function normalizePages(p: string): string {
  // Avoid touching ranges that already use en-dash sequences.
  const trimmed = p.trim();
  if (/--/.test(trimmed)) return trimmed;
  return trimmed.replace(/\s*[-–—]\s*/, "--");
}

/** True when current value is "missing" from BibTeX's perspective. */
export function isFieldMissing(value: string | undefined): boolean {
  if (!value) return true;
  const t = value.trim();
  if (!t) return true;
  if (t === "{}" || t === '""') return true;
  return false;
}

export const FIELD_LABELS: Record<FieldName, string> = {
  journal: "journal",
  booktitle: "booktitle",
  publisher: "publisher",
  address: "address",
  volume: "volume",
  number: "number",
  pages: "pages",
  isbn: "isbn",
  issn: "issn",
  series: "series",
  editor: "editor",
};
