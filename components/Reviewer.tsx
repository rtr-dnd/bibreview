"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParseResponse, ParsedEntry, SearchResponse } from "@/lib/types";
import type { ScoredCandidate, Verdict } from "@/lib/scoring";
import { authorLastNames, firstAuthorLastName } from "@/lib/bib";

type Decision =
  | { kind: "pending" }
  | { kind: "had-doi"; doi: string }
  | { kind: "doi"; doi: string; from: "candidate" | "manual" }
  | { kind: "skip" };

type EntryState = {
  entry: ParsedEntry;
  candidates?: ScoredCandidate[];
  searching: boolean;
  searched: boolean;
  error?: string;
  decision: Decision;
};

type StoredSession = {
  version: 1;
  filename: string;
  source: string;
  selectedKey: string | null;
  entries: Array<Omit<EntryState, "searching">>;
};

const SEARCH_CONCURRENCY = 4;
const STORAGE_KEY = "doireview:session:v1";

export default function Reviewer() {
  const [source, setSource] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryState[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Stable concurrency-limited search runner. The queue holds the ParsedEntry
  // directly so we don't depend on a stale snapshot of `entries`.
  const searchPool = useRef<{
    active: number;
    queue: ParsedEntry[];
    inflight: Set<string>;
  }>({ active: 0, queue: [], inflight: new Set() });

  const pumpSearch = useCallback(() => {
    const pool = searchPool.current;
    while (pool.active < SEARCH_CONCURRENCY && pool.queue.length > 0) {
      const entry = pool.queue.shift()!;
      const key = entry.key;
      pool.inflight.add(key);
      pool.active++;
      setEntries((prev) =>
        prev?.map((s) => (s.entry.key === key ? { ...s, searching: true, error: undefined } : s)) ?? prev,
      );
      runSearch(entry)
        .then((cands) => {
          setEntries((prev) =>
            prev?.map((s) =>
              s.entry.key === key ? { ...s, candidates: cands, searching: false, searched: true } : s,
            ) ?? prev,
          );
        })
        .catch((err) => {
          setEntries((prev) =>
            prev?.map((s) =>
              s.entry.key === key
                ? { ...s, searching: false, searched: true, error: String(err) }
                : s,
            ) ?? prev,
          );
        })
        .finally(() => {
          pool.active--;
          pool.inflight.delete(key);
          pumpSearch();
        });
    }
  }, []);

  const enqueueSearch = useCallback(
    (toSearch: ParsedEntry[]) => {
      const pool = searchPool.current;
      for (const e of toSearch) {
        if (pool.inflight.has(e.key)) continue;
        if (pool.queue.some((q) => q.key === e.key)) continue;
        pool.queue.push(e);
      }
      pumpSearch();
    },
    [pumpSearch],
  );

  const onUpload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const text = await file.text();
        setFilename(file.name);
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: text }),
        });
        if (!res.ok) throw new Error(`parse failed: ${res.status}`);
        const data = (await res.json()) as ParseResponse;
        setSource(data.source);
        const states: EntryState[] = data.entries.map((e) => ({
          entry: e,
          searching: false,
          searched: false,
          decision: e.existingDoi ? { kind: "had-doi", doi: e.existingDoi } : { kind: "pending" },
        }));
        // Reset any in-flight search state from a previous file.
        searchPool.current = { active: 0, queue: [], inflight: new Set() };
        setEntries(states);
        const firstUndecided = states.find((s) => s.decision.kind === "pending");
        setSelectedKey((firstUndecided ?? states[0])?.entry.key ?? null);
        enqueueSearch(
          states.filter((s) => s.decision.kind === "pending").map((s) => s.entry),
        );
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [enqueueSearch],
  );

  // Hydrate from localStorage on mount (once).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as StoredSession;
        if (data.version === 1 && Array.isArray(data.entries)) {
          const restored: EntryState[] = data.entries.map((s) => ({ ...s, searching: false }));
          setSource(data.source);
          setFilename(data.filename);
          setEntries(restored);
          setSelectedKey(data.selectedKey);
          const toResume = restored
            .filter((s) => s.decision.kind === "pending" && !s.searched)
            .map((s) => s.entry);
          if (toResume.length) enqueueSearch(toResume);
        }
      }
    } catch (e) {
      console.warn("[doireview] failed to restore session", e);
    } finally {
      setHydrated(true);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change. Skip writes until hydration completes so the initial
  // null state doesn't clobber a saved session.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      if (!entries || !source) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const data: StoredSession = {
        version: 1,
        filename,
        source,
        selectedKey,
        entries: entries.map(({ searching: _searching, ...rest }) => rest),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[doireview] failed to save session", e);
    }
  }, [hydrated, entries, source, filename, selectedKey]);

  const onReset = useCallback(() => {
    if (entries && entries.length > 0) {
      const ok = window.confirm("現在の進捗を破棄して新しいファイルを取り込みますか？");
      if (!ok) return;
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    searchPool.current = { active: 0, queue: [], inflight: new Set() };
    setEntries(null);
    setSource(null);
    setFilename("");
    setSelectedKey(null);
    setError(null);
  }, [entries]);

  /** Force a re-search. Resets the entry's decision to pending and re-queues. */
  const onResearch = useCallback(
    (key: string) => {
      if (!entries) return;
      const target = entries.find((s) => s.entry.key === key);
      if (!target) return;
      setEntries((prev) =>
        prev?.map((s) =>
          s.entry.key === key
            ? {
                ...s,
                decision: { kind: "pending" },
                candidates: undefined,
                searched: false,
                error: undefined,
              }
            : s,
        ) ?? prev,
      );
      enqueueSearch([target.entry]);
    },
    [entries, enqueueSearch],
  );

  const stats = useMemo(() => {
    if (!entries) return null;
    let withDoi = 0,
      missing = 0,
      decided = 0,
      skipped = 0,
      undecided = 0;
    for (const e of entries) {
      if (e.entry.existingDoi) withDoi++;
      else missing++;
      if (e.decision.kind === "doi") decided++;
      else if (e.decision.kind === "skip") skipped++;
      else if (e.decision.kind === "pending") undecided++;
    }
    return { withDoi, missing, decided, skipped, undecided, total: entries.length };
  }, [entries]);

  const onDecide = useCallback(
    (key: string, decision: Decision) => {
      setEntries((prev) => {
        if (!prev) return prev;
        return prev.map((s) => (s.entry.key === key ? { ...s, decision } : s));
      });
    },
    [],
  );

  const onAdvance = useCallback(() => {
    if (!entries) return;
    const idx = entries.findIndex((s) => s.entry.key === selectedKey);
    if (idx < 0) return;
    // Find next entry that is pending; wrap to next index otherwise.
    for (let off = 1; off <= entries.length; off++) {
      const ni = (idx + off) % entries.length;
      const s = entries[ni];
      if (s.decision.kind === "pending") {
        setSelectedKey(s.entry.key);
        return;
      }
    }
    // Nothing pending; just go to next sibling
    const next = entries[(idx + 1) % entries.length];
    setSelectedKey(next.entry.key);
  }, [entries, selectedKey]);

  const onExport = useCallback(async () => {
    if (!source || !entries) return;
    const decisions: Record<string, string | null> = {};
    for (const s of entries) {
      if (s.decision.kind === "doi") decisions[s.entry.key] = s.decision.doi;
    }
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, decisions }),
    });
    if (!res.ok) {
      setError(`export failed: ${res.status}`);
      return;
    }
    const data = (await res.json()) as { bib: string };
    const blob = new Blob([data.bib], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = filename.replace(/\.bib$/i, "") || "output";
    a.download = `${baseName}.with-doi.bib`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [source, entries, filename]);

  if (!hydrated) {
    return <div className="flex flex-1 items-center justify-center min-h-screen text-[var(--muted)] text-sm">読み込み中…</div>;
  }
  if (!entries) {
    return (
      <Uploader
        busy={busy}
        error={error}
        onFile={onUpload}
      />
    );
  }
  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar
        entries={entries}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        stats={stats}
        onExport={onExport}
        onReset={onReset}
        filename={filename}
      />
      <DetailPane
        entries={entries}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onDecide={onDecide}
        onAdvance={onAdvance}
        onResearch={onResearch}
      />
    </div>
  );
}

async function runSearch(entry: ParsedEntry): Promise<ScoredCandidate[]> {
  const title = entry.fields.title ?? "";
  const yearRaw = entry.fields.year ?? "";
  const year = /^\d{4}/.exec(yearRaw)?.[0] ? Number(/^\d{4}/.exec(yearRaw)![0]) : null;
  const lastNames = authorLastNames(entry.fields.author);
  const author = firstAuthorLastName(entry.fields.author);
  if (!title.trim()) return [];
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, author, year, authorLastNames: lastNames }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`search ${res.status}: ${body?.error ?? "unknown"}`);
  }
  const data = (await res.json()) as SearchResponse;
  return data.candidates;
}

function Uploader({ busy, error, onFile }: { busy: boolean; error: string | null; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="flex flex-1 items-center justify-center min-h-screen p-8">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold mb-2">DOI Review</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          .bibファイルをアップロードすると、DOIが入っていないエントリについてCrossRefから候補を取得し、1件ずつレビューできます。
        </p>
        <label
          className={`block border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            drag ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-[var(--border)]"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
        >
          <div className="text-base mb-2">.bib をドロップ</div>
          <div className="text-xs text-[var(--muted)] mb-4">またはクリックして選択</div>
          <input
            type="file"
            accept=".bib,text/x-bibtex,application/x-bibtex,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            className="px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel)]"
            onClick={(e) => {
              const input = (e.currentTarget.parentElement as HTMLLabelElement).querySelector(
                'input[type="file"]',
              ) as HTMLInputElement;
              input?.click();
            }}
          >
            {busy ? "処理中…" : "ファイルを選択"}
          </button>
        </label>
        {error && <div className="mt-4 text-sm text-[var(--red)]">{error}</div>}
      </div>
    </div>
  );
}

function Sidebar({
  entries,
  selectedKey,
  onSelect,
  stats,
  onExport,
  onReset,
  filename,
}: {
  entries: EntryState[];
  selectedKey: string | null;
  onSelect: (k: string) => void;
  stats: { withDoi: number; missing: number; decided: number; skipped: number; undecided: number; total: number } | null;
  onExport: () => void;
  onReset: () => void;
  filename: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedKey ?? "")}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);
  return (
    <aside className="w-[340px] shrink-0 border-r border-[var(--border)] bg-[var(--panel)] flex flex-col h-screen sticky top-0">
      <header className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">DOI Review</div>
          {filename && <div className="text-xs text-[var(--muted)] truncate flex-1 min-w-0">{filename}</div>}
          <button
            onClick={onReset}
            title="新しい.bibファイルを取り込む（現在の進捗は破棄）"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--panel-2)] shrink-0"
          >
            新規
          </button>
        </div>
        {stats && (
          <div className="mt-2 text-xs text-[var(--muted)] flex flex-wrap gap-x-3 gap-y-1">
            <span>合計 {stats.total}</span>
            <span>既存DOI {stats.withDoi}</span>
            <span>未決 {stats.undecided}</span>
            <span>決定 {stats.decided}</span>
            <span>スキップ {stats.skipped}</span>
          </div>
        )}
        <button
          className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90"
          onClick={onExport}
        >
          .bibを書き出す
        </button>
        <Legend />
      </header>
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {entries.map((s) => (
          <EntryRow
            key={s.entry.key}
            state={s}
            selected={s.entry.key === selectedKey}
            onClick={() => onSelect(s.entry.key)}
          />
        ))}
      </div>
    </aside>
  );
}

function EntryRow({
  state,
  selected,
  onClick,
}: {
  state: EntryState;
  selected: boolean;
  onClick: () => void;
}) {
  const { entry, decision } = state;
  return (
    <button
      data-key={entry.key}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--panel-2)] ${
        selected ? "bg-[var(--panel-2)]" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <DecisionBadge state={state} />
        <div className="font-medium text-sm truncate">{entry.key}</div>
      </div>
      <div className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{entry.fields.title || "(no title)"}</div>
      <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
        {firstAuthorLastName(entry.fields.author) || "—"} · {entry.fields.year || "—"} · {entry.type}
      </div>
      {decision.kind === "doi" && (
        <div className="text-[11px] mono text-[var(--green)] mt-0.5 truncate">→ {decision.doi}</div>
      )}
      {decision.kind === "had-doi" && (
        <div className="text-[11px] mono text-[var(--accent)] mt-0.5 truncate">→ {decision.doi}</div>
      )}
    </button>
  );
}

function Legend() {
  const items: { color: string; label: string; icon?: "spinner" }[] = [
    { color: "var(--accent)", label: "既存DOI" },
    { color: "var(--green)", label: "承認 / 自動承認候補" },
    { color: "var(--yellow)", label: "要確認 (likely)" },
    { color: "var(--red)", label: "低確度 / 候補なし" },
    { color: "var(--grey)", label: "未検索 / スキップ" },
  ];
  return (
    <details className="mt-2 text-[11px] text-[var(--muted)]">
      <summary className="cursor-pointer select-none hover:text-[var(--foreground)]">凡例</summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: it.color }}
            />
            <span>{it.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <Spinner />
          <span>検索中</span>
        </li>
      </ul>
      <div className="mt-2 leading-relaxed">
        候補カードのバッジ:{" "}
        <span className="px-1 rounded bg-[color-mix(in_srgb,var(--green)_25%,transparent)] text-[var(--green)]">
          VERIFIED
        </span>{" "}
        タイトル/著者/年が高い確度で一致 ·{" "}
        <span className="px-1 rounded bg-[color-mix(in_srgb,var(--yellow)_25%,transparent)] text-[var(--yellow)]">
          LIKELY
        </span>{" "}
        要確認 ·{" "}
        <span className="px-1 rounded bg-[color-mix(in_srgb,var(--red)_25%,transparent)] text-[var(--red)]">
          UNCERTAIN
        </span>{" "}
        低確度
      </div>
    </details>
  );
}

function DecisionBadge({ state }: { state: EntryState }) {
  const { decision, searching, searched, candidates } = state;
  if (decision.kind === "had-doi") return <Dot color="var(--accent)" title="既にDOIあり" />;
  if (decision.kind === "doi") return <Dot color="var(--green)" title="承認済み" />;
  if (decision.kind === "skip") return <Dot color="var(--grey)" title="スキップ" />;
  if (searching) return <Spinner />;
  if (!searched) return <Dot color="var(--grey)" title="未検索" />;
  // searched, no decision
  const top = candidates?.[0];
  if (!top) return <Dot color="var(--red)" title="候補なし" />;
  if (top.verdict === "verified") return <Dot color="var(--green)" title="自動承認候補" />;
  if (top.verdict === "likely") return <Dot color="var(--yellow)" title="要確認" />;
  return <Dot color="var(--red)" title="低確度" />;
}

function Dot({ color, title }: { color: string; title: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      title={title}
    />
  );
}

function Spinner() {
  return (
    <span
      aria-label="searching"
      className="inline-block w-2.5 h-2.5 rounded-full border-2 border-[var(--muted)] border-t-transparent animate-spin"
    />
  );
}

function DetailPane({
  entries,
  selectedKey,
  onSelect,
  onDecide,
  onAdvance,
  onResearch,
}: {
  entries: EntryState[];
  selectedKey: string | null;
  onSelect: (k: string) => void;
  onDecide: (key: string, d: Decision) => void;
  onAdvance: () => void;
  onResearch: (key: string) => void;
}) {
  const state = entries.find((s) => s.entry.key === selectedKey) ?? null;

  useEffect(() => {
    if (!state) return;
    const handler = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const editable =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editable) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const key = ev.key;
      if (key === "Enter") {
        const top = state.candidates?.[0];
        if (top) {
          onDecide(state.entry.key, { kind: "doi", doi: top.doi, from: "candidate" });
          onAdvance();
          ev.preventDefault();
        }
      } else if (/^[1-9]$/.test(key)) {
        const idx = Number(key) - 1;
        const c = state.candidates?.[idx];
        if (c) {
          onDecide(state.entry.key, { kind: "doi", doi: c.doi, from: "candidate" });
          onAdvance();
          ev.preventDefault();
        }
      } else if (key === "s") {
        onDecide(state.entry.key, { kind: "skip" });
        onAdvance();
        ev.preventDefault();
      } else if (key === "j" || key === "ArrowDown") {
        const i = entries.findIndex((s) => s.entry.key === state.entry.key);
        const next = entries[Math.min(entries.length - 1, i + 1)];
        if (next) {
          ev.preventDefault();
          onSelect(next.entry.key);
        }
      } else if (key === "k" || key === "ArrowUp") {
        const i = entries.findIndex((s) => s.entry.key === state.entry.key);
        const next = entries[Math.max(0, i - 1)];
        if (next) {
          ev.preventDefault();
          onSelect(next.entry.key);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, entries, onDecide, onAdvance, onSelect]);

  if (!state) {
    return <main className="flex-1 p-8 text-[var(--muted)]">エントリを選択してください</main>;
  }

  return (
    <DetailContent
      state={state}
      entries={entries}
      onDecide={onDecide}
      onAdvance={onAdvance}
      onResearch={onResearch}
    />
  );
}

function DetailContent({
  state,
  entries,
  onDecide,
  onAdvance,
  onResearch,
}: {
  state: EntryState;
  entries: EntryState[];
  onDecide: (key: string, d: Decision) => void;
  onAdvance: () => void;
  onResearch: (key: string) => void;
}) {
  const { entry, candidates, searching, searched, error, decision } = state;
  const queryTitleTokens = useMemo(() => tokenSet(entry.fields.title ?? ""), [entry]);
  const queryAuthorLasts = useMemo(
    () => new Set(authorLastNames(entry.fields.author).map((s) => s.toLowerCase())),
    [entry],
  );
  const queryYear = useMemo(() => {
    const m = /^\d{4}/.exec(entry.fields.year ?? "");
    return m ? Number(m[0]) : null;
  }, [entry]);

  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const editable =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editable) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "e") {
        ev.preventDefault();
        setManualOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const idx = entries.findIndex((s) => s.entry.key === entry.key);
  const nav = `${idx + 1} / ${entries.length}`;

  return (
    <main className="flex-1 min-w-0 p-6 overflow-y-auto h-screen">
      <div className="max-w-3xl mx-auto">
        <div className="text-xs text-[var(--muted)]">{nav}</div>
        <h2 className="text-xl font-semibold mt-1 break-words">
          {entry.fields.title || "(no title)"}
        </h2>
        <div className="text-sm text-[var(--muted)] mt-1 break-words">
          {entry.fields.author || "—"} · {entry.fields.year || "—"} ·{" "}
          <span className="mono">{entry.type}</span>{" "}
          <span className="mono">@{entry.key}</span>
        </div>
        {entry.fields.journal && (
          <div className="text-xs text-[var(--muted)] mt-0.5">journal: {entry.fields.journal}</div>
        )}
        {entry.fields.booktitle && (
          <div className="text-xs text-[var(--muted)] mt-0.5">booktitle: {entry.fields.booktitle}</div>
        )}

        {/* Decision banner */}
        <DecisionBanner state={state} onDecide={onDecide} onResearch={onResearch} />

        {/* Candidate list or status */}
        <section className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold">CrossRef候補</h3>
            {searching && <span className="text-xs text-[var(--muted)]">検索中…</span>}
            {error && <span className="text-xs text-[var(--red)]">エラー: {error}</span>}
            <button
              onClick={() => onResearch(entry.key)}
              disabled={searching}
              title="CrossRefをもう一度検索する（既存の判定はクリア）"
              className="ml-auto text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--panel)] disabled:opacity-50"
            >
              {searched || error ? "再検索" : "検索"}
            </button>
          </div>

          {!searched && !searching && !entry.existingDoi && (
            <div className="text-sm text-[var(--muted)]">未検索</div>
          )}
          {searched && !error && (candidates?.length ?? 0) === 0 && (
            <div className="text-sm text-[var(--muted)]">候補なし。CrossRefにDOIが存在しない可能性が高いです（書籍・ブログ・古い雑誌記事など）。</div>
          )}

          <ul className="flex flex-col gap-2">
            {candidates?.map((c, i) => (
              <CandidateCard
                key={c.doi}
                index={i + 1}
                cand={c}
                queryTitleTokens={queryTitleTokens}
                queryAuthorLasts={queryAuthorLasts}
                queryYear={queryYear}
                onAccept={() => {
                  onDecide(entry.key, { kind: "doi", doi: c.doi, from: "candidate" });
                  onAdvance();
                }}
              />
            ))}
          </ul>
        </section>

        {/* Manual / skip actions */}
        <section className="mt-6 flex flex-wrap gap-2">
          <button
            className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel)]"
            onClick={() => setManualOpen((v) => !v)}
          >
            DOIを手入力 (e)
          </button>
          <button
            className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel)]"
            onClick={() => {
              onDecide(entry.key, { kind: "skip" });
              onAdvance();
            }}
          >
            スキップ / DOI無し (s)
          </button>
          {decision.kind !== "pending" && decision.kind !== "had-doi" && (
            <button
              className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel)]"
              onClick={() => onDecide(entry.key, { kind: "pending" })}
            >
              判定をクリア
            </button>
          )}
        </section>
        {manualOpen && (
          <ManualDoiInput
            initial={decision.kind === "doi" ? decision.doi : ""}
            onSubmit={(doi) => {
              setManualOpen(false);
              onDecide(entry.key, { kind: "doi", doi, from: "manual" });
              onAdvance();
            }}
            onCancel={() => setManualOpen(false)}
          />
        )}

        <section className="mt-8">
          <div className="text-xs text-[var(--muted)] mb-1">原文 (BibTeX)</div>
          <pre className="text-xs mono p-3 rounded bg-[var(--panel)] border border-[var(--border)] whitespace-pre-wrap break-words">
            {entry.raw}
          </pre>
        </section>

        <section className="mt-6 text-xs text-[var(--muted)]">
          ショートカット: Enterで先頭候補を承認 / 1〜9で候補選択 / sでスキップ / eで手入力 / ↑↓またはJ/Kで前後移動
        </section>
      </div>
    </main>
  );
}

function DecisionBanner({
  state,
  onDecide,
  onResearch,
}: {
  state: EntryState;
  onDecide: (key: string, d: Decision) => void;
  onResearch: (key: string) => void;
}) {
  const { decision, entry } = state;
  if (decision.kind === "had-doi") {
    return (
      <div className="mt-4 p-3 rounded border border-[var(--border)] bg-[var(--panel)] text-sm flex items-center gap-3">
        <span className="text-[var(--accent)]">●</span>
        <div className="flex-1 min-w-0">
          このエントリには既にDOIがあります:{" "}
          <DoiLink doi={decision.doi} />
        </div>
        <button
          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--panel-2)]"
          onClick={() => onResearch(entry.key)}
        >
          無視して再検索する
        </button>
      </div>
    );
  }
  if (decision.kind === "doi") {
    return (
      <div className="mt-4 p-3 rounded border border-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-sm">
        <span className="text-[var(--green)]">✓</span> 承認済み:{" "}
        <DoiLink doi={decision.doi} />{" "}
        <span className="text-[var(--muted)]">({decision.from === "manual" ? "手入力" : "候補から"})</span>
      </div>
    );
  }
  if (decision.kind === "skip") {
    return (
      <div className="mt-4 p-3 rounded border border-[var(--border)] bg-[var(--panel)] text-sm">
        <span className="text-[var(--muted)]">—</span> スキップ（DOI無しと確定）
      </div>
    );
  }
  return null;
}

function DoiLink({ doi }: { doi: string }) {
  return (
    <a
      className="mono break-all underline decoration-dotted hover:decoration-solid"
      href={`https://doi.org/${doi}`}
      target="_blank"
      rel="noreferrer"
      title="doi.org で開く"
    >
      {doi}
      <span aria-hidden className="ml-1 text-[var(--muted)]">↗</span>
    </a>
  );
}

function ManualDoiInput({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (doi: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="mt-3 p-3 rounded border border-[var(--border)] bg-[var(--panel)]">
      <label className="text-xs text-[var(--muted)] block mb-1">DOIを直接入力</label>
      <div className="flex gap-2">
        <input
          ref={ref}
          className="flex-1 mono text-sm px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--panel-2)]"
          placeholder="10.xxxx/yyyy"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const doi = normalizeDoi(v);
              if (doi) onSubmit(doi);
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
        />
        <button
          className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90"
          onClick={() => {
            const doi = normalizeDoi(v);
            if (doi) onSubmit(doi);
          }}
        >
          保存
        </button>
        <button
          className="text-sm px-3 py-1.5 rounded border border-[var(--border)]"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

function normalizeDoi(raw: string): string | null {
  const m = /10\.\d{4,9}\/[^\s"'<>]+/.exec(raw.trim());
  return m ? m[0] : null;
}

function CandidateCard({
  index,
  cand,
  queryTitleTokens,
  queryAuthorLasts,
  queryYear,
  onAccept,
}: {
  index: number;
  cand: ScoredCandidate;
  queryTitleTokens: Set<string>;
  queryAuthorLasts: Set<string>;
  queryYear: number | null;
  onAccept: () => void;
}) {
  return (
    <li className="border border-[var(--border)] rounded p-3 bg-[var(--panel-2)]">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${verdictClass(cand.verdict)}`}>
          {verdictLabel(cand.verdict)}
        </span>
        <span className="text-xs text-[var(--muted)]">#{index}</span>
        <span className="text-xs text-[var(--muted)]">
          combined {Math.round(cand.combined * 100)} · title {Math.round(cand.titleSim * 100)} · author{" "}
          {Math.round(cand.authorOverlap * 100)} · year {cand.yearDiff ?? "?"}
        </span>
        <button
          className="ml-auto text-xs px-2 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90"
          onClick={onAccept}
        >
          採用 ({index})
        </button>
      </div>
      <div className="text-sm font-medium break-words">
        {highlightTitle(cand.title, queryTitleTokens)}
      </div>
      <div className="text-xs text-[var(--muted)] mt-1 break-words">
        {cand.authors.map((a, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <AuthorName a={a} known={queryAuthorLasts.has((a.family ?? "").toLowerCase())} />
          </span>
        ))}
      </div>
      <div className="text-xs text-[var(--muted)] mt-0.5">
        {cand.container || "—"} ·{" "}
        <span className={cand.year && queryYear && Math.abs(cand.year - queryYear) > 1 ? "text-[var(--red)]" : ""}>
          {cand.year ?? "?"}
        </span>{" "}
        · {cand.type}
      </div>
      <div className="text-xs mono mt-1 break-all">
        <a href={`https://doi.org/${cand.doi}`} target="_blank" rel="noreferrer">
          {cand.doi}
        </a>
      </div>
    </li>
  );
}

function AuthorName({ a, known }: { a: { given?: string; family?: string }; known: boolean }) {
  const text = `${a.given ?? ""} ${a.family ?? ""}`.trim();
  return (
    <span className={known ? "px-1 rounded" : undefined} style={known ? { backgroundColor: "var(--diff-add-bg)" } : undefined}>
      {text}
    </span>
  );
}

function highlightTitle(title: string, queryTokens: Set<string>) {
  // strip simple HTML tags from CrossRef
  const cleaned = title.replace(/<[^>]+>/g, "");
  const parts = cleaned.split(/(\s+)/);
  return parts.map((p, i) => {
    if (/^\s+$/.test(p)) return <span key={i}>{p}</span>;
    const norm = p.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const known = norm.length >= 2 && queryTokens.has(norm);
    return (
      <span key={i} style={known ? { backgroundColor: "var(--diff-add-bg)" } : undefined}>
        {p}
      </span>
    );
  });
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^\p{L}\p{N} ]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function verdictLabel(v: Verdict): string {
  if (v === "verified") return "VERIFIED";
  if (v === "likely") return "LIKELY";
  return "UNCERTAIN";
}
function verdictClass(v: Verdict): string {
  if (v === "verified") return "bg-[color-mix(in_srgb,var(--green)_25%,transparent)] text-[var(--green)]";
  if (v === "likely") return "bg-[color-mix(in_srgb,var(--yellow)_25%,transparent)] text-[var(--yellow)]";
  return "bg-[color-mix(in_srgb,var(--red)_25%,transparent)] text-[var(--red)]";
}
