// Tolerant BibTeX parser/serializer.
// Preserves the raw text of each entry so we can re-emit the file with
// minimal modifications (only the chosen DOI is injected/replaced).

export type BibEntry = {
  type: string;
  key: string;
  fields: Record<string, string>;
  /** Raw text of the entry from "@type{" through the matching closing "}". */
  raw: string;
  /** Byte offsets in the original source. */
  start: number;
  end: number;
};

export type ParsedBib = {
  source: string;
  entries: BibEntry[];
};

const ENTRY_RE = /@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,/g;
const DOI_RE = /10\.\d{4,9}\/[^\s"'<>{}]+/i;

export function parseBib(source: string): ParsedBib {
  const entries: BibEntry[] = [];
  ENTRY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTRY_RE.exec(source))) {
    const headerStart = m.index;
    const braceOpen = source.indexOf("{", headerStart);
    if (braceOpen < 0) break;

    let depth = 0;
    let i = braceOpen;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break;

    const body = source.slice(braceOpen + 1, i);
    const commaIdx = body.indexOf(",");
    const fieldsBody = commaIdx >= 0 ? body.slice(commaIdx + 1) : "";
    const fields = parseFields(fieldsBody);

    entries.push({
      type: m[1].toLowerCase(),
      key: m[2],
      fields,
      raw: source.slice(headerStart, i + 1),
      start: headerStart,
      end: i + 1,
    });
    ENTRY_RE.lastIndex = i + 1;
  }
  return { source, entries };
}

function parseFields(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  const n = body.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(body[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && body[i] !== "=" && !/\s/.test(body[i])) i++;
    const name = body.slice(nameStart, i).trim().toLowerCase();
    while (i < n && /\s/.test(body[i])) i++;
    if (body[i] !== "=") break;
    i++;
    while (i < n && /\s/.test(body[i])) i++;
    if (i >= n) break;
    let value = "";
    if (body[i] === "{") {
      let depth = 0;
      const start = i;
      for (; i < n; i++) {
        if (body[i] === "{") depth++;
        else if (body[i] === "}") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
      value = body.slice(start, i);
    } else if (body[i] === '"') {
      const start = i;
      i++;
      while (i < n && body[i] !== '"') i++;
      i++; // consume closing quote
      value = body.slice(start, i);
    } else {
      const start = i;
      while (i < n && body[i] !== ",") i++;
      value = body.slice(start, i);
    }
    out[name] = stripDelims(value);
  }
  return out;
}

function stripDelims(v: string): string {
  let s = v.trim();
  while (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === "{" && b === "}") || (a === '"' && b === '"')) {
      s = s.slice(1, -1).trim();
    } else break;
  }
  // collapse internal whitespace runs
  return s.replace(/\s+/g, " ");
}

/** Returns existing DOI for an entry, scanning doi/url fields. */
export function existingDoi(e: BibEntry): string | null {
  const candidates = [e.fields.doi, e.fields.url, e.fields.howpublished].filter(Boolean) as string[];
  for (const c of candidates) {
    const m = DOI_RE.exec(c);
    if (m) return cleanDoi(m[0]);
  }
  return null;
}

export function cleanDoi(doi: string): string {
  return doi.replace(/[).,;\]]+$/, "").trim();
}

/** Heuristic: which entry types could plausibly have a DOI in CrossRef. */
export function couldHaveDoi(e: BibEntry): boolean {
  const t = e.type.toLowerCase();
  // misc entries are usually URLs/blogs — can still have DOI but rarely.
  // We still allow them but the UI can hint that misc rarely has DOI.
  return !["online", "manual"].includes(t);
}

export function firstAuthorLastName(authorsField: string | undefined): string {
  if (!authorsField) return "";
  const first = authorsField.split(/\s+and\s+/i)[0]?.trim() ?? "";
  if (first.includes(",")) return first.split(",")[0].trim();
  const parts = first.split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

export function authorLastNames(authorsField: string | undefined): string[] {
  if (!authorsField) return [];
  return authorsField
    .split(/\s+and\s+/i)
    .map((a) => {
      const t = a.trim();
      if (t.includes(",")) return t.split(",")[0].trim();
      const parts = t.split(/\s+/);
      return parts[parts.length - 1] ?? "";
    })
    .filter(Boolean);
}

/**
 * Re-emit the source with arbitrary field edits applied. Edits map
 * entry key -> field name -> new value. Falsy values are skipped.
 */
export function applyEntryEdits(
  parsed: ParsedBib,
  edits: Record<string, Record<string, string | null | undefined>>,
): string {
  let out = parsed.source;
  const ordered = [...parsed.entries].sort((a, b) => b.start - a.start);
  for (const e of ordered) {
    const fields = edits[e.key];
    if (!fields) continue;
    let raw = e.raw;
    for (const [name, value] of Object.entries(fields)) {
      if (!value) continue;
      raw = setField(raw, name, value);
    }
    if (raw !== e.raw) out = out.slice(0, e.start) + raw + out.slice(e.end);
  }
  return out;
}

/** Backwards-compatible: only set the doi field. */
export function applyDois(parsed: ParsedBib, decisions: Record<string, string | null>): string {
  const edits: Record<string, Record<string, string | null>> = {};
  for (const [k, v] of Object.entries(decisions)) edits[k] = { doi: v };
  return applyEntryEdits(parsed, edits);
}

function setField(raw: string, name: string, value: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fieldRe = new RegExp(`(\\b${escaped}\\s*=\\s*)(\\{[^{}]*\\}|"[^"]*"|[^,\\n]*)`, "i");
  if (fieldRe.test(raw)) {
    return raw.replace(fieldRe, `$1{${value}}`);
  }
  // Detect indentation from the last field line.
  const lines = raw.split("\n");
  let indent = "  ";
  for (const line of lines) {
    const m = /^(\s+)\S+\s*=/.exec(line);
    if (m) {
      indent = m[1];
      break;
    }
  }
  const closeIdx = raw.lastIndexOf("}");
  if (closeIdx < 0) return raw;
  const before = raw.slice(0, closeIdx);
  const trimmedBefore = before.trimEnd();
  const lastChar = trimmedBefore[trimmedBefore.length - 1];
  let prefix = before;
  if (lastChar !== "," && lastChar !== "{") {
    prefix = trimmedBefore + ",\n";
  } else if (!before.endsWith("\n")) {
    prefix = before + "\n";
  }
  const insertion = `${indent}${name} = {${value}},\n`;
  // Re-attach the closing brace at original column (start of closeIdx line).
  const after = raw.slice(closeIdx);
  return prefix + insertion + after;
}
