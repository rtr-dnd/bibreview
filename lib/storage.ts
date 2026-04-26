// Local storage hydration/save for the review session.

import type {
  EntryState,
  MetaState,
  Step,
  StoredEntry,
  StoredSession,
} from "@/lib/state";

export const STORAGE_KEY = "bibreview:session:v2";
const LEGACY_KEYS = ["doireview:session:v2", "doireview:session:v1"];

export type LoadedSession = {
  filename: string;
  source: string;
  selectedKey: string | null;
  step: Step;
  entries: EntryState[];
};

export function loadSession(): LoadedSession | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const k of LEGACY_KEYS) {
        const legacy = window.localStorage.getItem(k);
        if (legacy) {
          raw = legacy;
          break;
        }
      }
    }
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredSession>;
    if (!data || !Array.isArray(data.entries)) return null;
    const entries: EntryState[] = (data.entries as StoredEntry[]).map((s) => {
      const meta: MetaState | undefined = s.meta ? { ...s.meta, fetching: false } : undefined;
      const { meta: _meta, ...rest } = s;
      return { ...rest, searching: false, meta };
    });
    return {
      filename: data.filename ?? "",
      source: data.source ?? "",
      selectedKey: data.selectedKey ?? null,
      step: (data.step as Step) ?? "doi",
      entries,
    };
  } catch (err) {
    console.warn("[bibreview] failed to restore session", err);
    return null;
  }
}

export function saveSession(s: LoadedSession): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredSession = {
      version: 2,
      filename: s.filename,
      source: s.source,
      selectedKey: s.selectedKey,
      step: s.step,
      entries: s.entries.map((e): StoredEntry => {
        const { searching: _searching, meta, ...rest } = e;
        if (!meta) return { ...rest, meta: undefined };
        const { fetching: _fetching, ...mrest } = meta;
        return { ...rest, meta: mrest };
      }),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    // Cleanup any legacy keys once we've migrated.
    for (const k of LEGACY_KEYS) window.localStorage.removeItem(k);
  } catch (err) {
    console.warn("[bibreview] failed to save session", err);
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    for (const k of LEGACY_KEYS) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
