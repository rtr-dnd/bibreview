"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authorLastNames, firstAuthorLastName } from "@/lib/bib";
import type { ScoredCandidate } from "@/lib/scoring";
import type { CrossrefItem } from "@/lib/crossref";
import type { ParseResponse, ParsedEntry, SearchResponse } from "@/lib/types";
import type { Decision, EntryState, FieldDecision, MetaState, Step } from "@/lib/state";
import { resolvedDoi } from "@/lib/state";
import type { FieldName } from "@/lib/fields";
import { clearSession, loadSession, saveSession } from "@/lib/storage";
import { useTaskPool } from "@/lib/task-pool";
import { computeSuggestions, suggestionStatus } from "@/lib/suggestions";
import { UploadScreen } from "@/components/UploadScreen";
import { StepNav } from "@/components/StepNav";
import { Sidebar, type Stats } from "@/components/Sidebar";
import { DoiStep } from "@/components/doi/DoiStep";
import { MetadataStep } from "@/components/metadata/MetadataStep";

const SEARCH_CONCURRENCY = 4;
const META_CONCURRENCY = 4;

export default function Reviewer() {
  const [source, setSource] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryState[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [step, setStep] = useState<Step>("doi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Search pool: query CrossRef /works for one entry's title/author/year.
  const searchPool = useTaskPool<ParsedEntry>({
    concurrency: SEARCH_CONCURRENCY,
    run: async (entry) => {
      const key = entry.key;
      setEntries((prev) =>
        prev?.map((s) =>
          s.entry.key === key ? { ...s, searching: true, error: undefined } : s,
        ) ?? prev,
      );
      try {
        const cands = await runSearch(entry);
        setEntries((prev) =>
          prev?.map((s) =>
            s.entry.key === key
              ? { ...s, candidates: cands, searching: false, searched: true }
              : s,
          ) ?? prev,
        );
      } catch (err) {
        setEntries((prev) =>
          prev?.map((s) =>
            s.entry.key === key
              ? { ...s, searching: false, searched: true, error: String(err) }
              : s,
          ) ?? prev,
        );
      }
    },
  });

  // Meta pool: fetch /works/{doi} for an entry that has a DOI.
  const metaPool = useTaskPool<{ key: string; doi: string }>({
    concurrency: META_CONCURRENCY,
    run: async ({ key, doi }) => {
      setEntries((prev) =>
        prev?.map((s) =>
          s.entry.key === key
            ? { ...s, meta: ensureMeta(s.meta, { fetching: true, error: undefined }) }
            : s,
        ) ?? prev,
      );
      try {
        const work = await runWorkFetch(doi);
        setEntries((prev) =>
          prev?.map((s) =>
            s.entry.key === key
              ? {
                  ...s,
                  meta: ensureMeta(s.meta, {
                    fetching: false,
                    fetched: true,
                    work: work ?? undefined,
                    error: work ? undefined : "DOIが見つかりません",
                  }),
                }
              : s,
          ) ?? prev,
        );
      } catch (err) {
        setEntries((prev) =>
          prev?.map((s) =>
            s.entry.key === key
              ? {
                  ...s,
                  meta: ensureMeta(s.meta, {
                    fetching: false,
                    fetched: true,
                    error: String(err),
                  }),
                }
              : s,
          ) ?? prev,
        );
      }
    },
  });

  // -------- Hydration & persistence --------

  useEffect(() => {
    const data = loadSession();
    if (data) {
      setSource(data.source);
      setFilename(data.filename);
      setEntries(data.entries);
      setSelectedKey(data.selectedKey);
      setStep(data.step);
      // Resume in-flight DOI searches if any were marked pending+unsearched.
      const toResume = data.entries
        .filter((s) => s.decision.kind === "pending" && !s.searched)
        .map((s) => ({ id: s.entry.key, payload: s.entry }));
      if (toResume.length) searchPool.enqueue(toResume);
    }
    setHydrated(true);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!entries || !source) {
      clearSession();
      return;
    }
    saveSession({ source, filename, selectedKey, step, entries });
  }, [hydrated, entries, source, filename, selectedKey, step]);

  // -------- Top-level callbacks --------

  const ingest = useCallback(
    async (text: string, name: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: text }),
        });
        if (!res.ok) throw new Error(`parse failed: ${res.status}`);
        const data = (await res.json()) as ParseResponse;
        if (data.entries.length === 0) {
          throw new Error("有効なBibTeXエントリが見つかりませんでした");
        }
        setFilename(name);
        const states: EntryState[] = data.entries.map((e) => ({
          entry: e,
          searching: false,
          searched: false,
          decision: e.existingDoi ? { kind: "had-doi", doi: e.existingDoi } : { kind: "pending" },
        }));
        searchPool.reset();
        metaPool.reset();
        setSource(data.source);
        setEntries(states);
        setStep("doi");
        const firstUndecided = states.find((s) => s.decision.kind === "pending");
        setSelectedKey((firstUndecided ?? states[0])?.entry.key ?? null);
        const toQueue = states
          .filter((s) => s.decision.kind === "pending")
          .map((s) => ({ id: s.entry.key, payload: s.entry }));
        searchPool.enqueue(toQueue);
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [searchPool, metaPool],
  );

  const onUpload = useCallback(
    async (file: File) => {
      const text = await file.text();
      await ingest(text, file.name);
    },
    [ingest],
  );

  const onPasteText = useCallback(
    async (text: string) => {
      await ingest(text, "(pasted).bib");
    },
    [ingest],
  );

  const onReset = useCallback(() => {
    if (entries && entries.length > 0) {
      const ok = window.confirm("現在の進捗を破棄して新しいファイルを取り込みますか？");
      if (!ok) return;
    }
    clearSession();
    searchPool.reset();
    metaPool.reset();
    setEntries(null);
    setSource(null);
    setFilename("");
    setSelectedKey(null);
    setStep("doi");
    setError(null);
  }, [entries, searchPool, metaPool]);

  const onDecide = useCallback((key: string, decision: Decision) => {
    setEntries((prev) =>
      prev?.map((s) => {
        if (s.entry.key !== key) return s;
        // Reset metadata when decision changes (so subsequent step 2 re-fetches).
        const next: EntryState = { ...s, decision };
        if (s.meta && (decision.kind === "skip" || decision.kind === "pending")) {
          next.meta = undefined;
        }
        return next;
      }) ?? prev,
    );
  }, []);

  const onSelect = useCallback((key: string) => setSelectedKey(key), []);

  const onAdvanceDoi = useCallback(() => {
    setEntries((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => s.entry.key === selectedKey);
      if (idx < 0) return prev;
      for (let off = 1; off <= prev.length; off++) {
        const ni = (idx + off) % prev.length;
        if (prev[ni].decision.kind === "pending") {
          setSelectedKey(prev[ni].entry.key);
          return prev;
        }
      }
      const next = prev[(idx + 1) % prev.length];
      setSelectedKey(next.entry.key);
      return prev;
    });
  }, [selectedKey]);

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
                meta: undefined,
              }
            : s,
        ) ?? prev,
      );
      searchPool.enqueue([{ id: key, payload: target.entry }]);
    },
    [entries, searchPool],
  );

  // -------- Metadata callbacks --------

  const onRefetchMeta = useCallback(
    (key: string) => {
      if (!entries) return;
      const target = entries.find((s) => s.entry.key === key);
      const doi = target ? resolvedDoi(target) : null;
      if (!target || !doi) return;
      setEntries((prev) =>
        prev?.map((s) =>
          s.entry.key === key
            ? { ...s, meta: ensureMeta(undefined, { fetching: true }) }
            : s,
        ) ?? prev,
      );
      metaPool.enqueue([{ id: key, payload: { key, doi } }]);
    },
    [entries, metaPool],
  );

  const onAcceptField = useCallback(
    (key: string, field: FieldName, value: string) => {
      setEntries((prev) =>
        prev?.map((s) =>
          s.entry.key === key
            ? {
                ...s,
                meta: setFieldDecision(s.meta, field, { kind: "accept", value }),
              }
            : s,
        ) ?? prev,
      );
    },
    [],
  );

  const onSkipField = useCallback((key: string, field: FieldName) => {
    setEntries((prev) =>
      prev?.map((s) =>
        s.entry.key === key
          ? { ...s, meta: setFieldDecision(s.meta, field, { kind: "skip" }) }
          : s,
      ) ?? prev,
    );
  }, []);

  const onClearField = useCallback((key: string, field: FieldName) => {
    setEntries((prev) =>
      prev?.map((s) =>
        s.entry.key === key
          ? { ...s, meta: setFieldDecision(s.meta, field, { kind: "pending" }) }
          : s,
      ) ?? prev,
    );
  }, []);

  const decideAllPending = useCallback(
    (key: string, kind: "accept" | "skip") => {
      if (!entries) return;
      const target = entries.find((s) => s.entry.key === key);
      if (!target) return;
      const sugs = computeSuggestions(target);
      if (sugs.length === 0) return;
      setEntries((prev) =>
        prev?.map((s) => {
          if (s.entry.key !== key) return s;
          let meta = s.meta;
          for (const sg of sugs) {
            const cur = meta?.fields[sg.field];
            if (cur && cur.kind !== "pending") continue;
            const decision: FieldDecision =
              kind === "accept"
                ? { kind: "accept", value: sg.suggested }
                : { kind: "skip" };
            meta = setFieldDecision(meta, sg.field, decision);
          }
          return { ...s, meta };
        }) ?? prev,
      );
    },
    [entries],
  );

  const onAcceptAllMeta = useCallback(
    (key: string) => decideAllPending(key, "accept"),
    [decideAllPending],
  );
  const onSkipAllMeta = useCallback(
    (key: string) => decideAllPending(key, "skip"),
    [decideAllPending],
  );

  const onAdvanceMeta = useCallback(() => {
    setEntries((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => s.entry.key === selectedKey);
      if (idx < 0) return prev;
      for (let off = 1; off <= prev.length; off++) {
        const ni = (idx + off) % prev.length;
        const s = prev[ni];
        if (!resolvedDoi(s)) continue;
        const stat = suggestionStatus(s);
        if (stat.total > 0 && stat.decided < stat.total) {
          setSelectedKey(s.entry.key);
          return prev;
        }
      }
      const next = prev[(idx + 1) % prev.length];
      setSelectedKey(next.entry.key);
      return prev;
    });
  }, [selectedKey]);

  // -------- Step transition: trigger meta fetches when entering step 2 --------

  const lastStepRef = useRef(step);
  useEffect(() => {
    if (!entries) return;
    if (step !== "metadata" || lastStepRef.current === "metadata") {
      lastStepRef.current = step;
      return;
    }
    lastStepRef.current = step;

    // Compute the work-fetch tasks from the current entries snapshot. Doing
    // this outside the setEntries updater (rather than pushing from inside)
    // is essential — the updater may run later, after we'd already read
    // an empty array.
    const tasks: { id: string; payload: { key: string; doi: string } }[] = [];
    const taskKeys = new Set<string>();
    for (const s of entries) {
      const doi = resolvedDoi(s);
      if (!doi) continue;
      if (s.meta?.fetched && !s.meta.error) continue;
      if (s.meta?.fetching) continue;
      tasks.push({ id: s.entry.key, payload: { key: s.entry.key, doi } });
      taskKeys.add(s.entry.key);
    }
    if (tasks.length > 0) {
      setEntries((prev) =>
        prev?.map((s) =>
          taskKeys.has(s.entry.key)
            ? { ...s, meta: ensureMeta(s.meta, { fetching: true, error: undefined }) }
            : s,
        ) ?? prev,
      );
      metaPool.enqueue(tasks);
    }

    // When entering step 2, default selection to first eligible entry.
    setSelectedKey((cur) => {
      const hasDoi = (s: EntryState) => !!resolvedDoi(s);
      const curState = entries.find((s) => s.entry.key === cur);
      if (curState && hasDoi(curState)) return cur;
      const firstEligible = entries.find(hasDoi);
      return firstEligible?.entry.key ?? cur;
    });
  }, [step, entries, metaPool]);

  // -------- Export --------

  const onExport = useCallback(async () => {
    if (!source || !entries) return;
    const edits: Record<string, Record<string, string>> = {};
    for (const s of entries) {
      const fields: Record<string, string> = {};
      if (s.decision.kind === "doi") fields.doi = s.decision.doi;
      const meta = s.meta?.fields ?? {};
      for (const [name, fd] of Object.entries(meta)) {
        if (fd && fd.kind === "accept") fields[name] = fd.value;
      }
      if (Object.keys(fields).length > 0) edits[s.entry.key] = fields;
    }
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, edits }),
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

  // -------- Stats --------

  const stats = useMemo<Stats | null>(() => {
    if (!entries) return null;
    let withDoi = 0,
      decided = 0,
      skipped = 0,
      undecided = 0;
    for (const e of entries) {
      if (e.decision.kind === "had-doi") {
        withDoi++;
      }
      if (e.decision.kind === "doi") decided++;
      else if (e.decision.kind === "skip") skipped++;
      else if (e.decision.kind === "pending") undecided++;
    }
    return { withDoi, decided, skipped, undecided, total: entries.length };
  }, [entries]);

  const doiProgress = useMemo(() => {
    if (!entries) return { decided: 0, total: 0 };
    let decided = 0;
    for (const s of entries) {
      if (s.decision.kind !== "pending") decided++;
    }
    return { decided, total: entries.length };
  }, [entries]);

  const metaProgress = useMemo(() => {
    if (!entries) return { decided: 0, total: 0 };
    let total = 0;
    let decided = 0;
    for (const s of entries) {
      if (!resolvedDoi(s)) continue;
      const stat = suggestionStatus(s);
      total += stat.total;
      decided += stat.decided;
    }
    return { decided, total };
  }, [entries]);

  // -------- Render --------

  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen text-[var(--muted)] text-sm">
        読み込み中…
      </div>
    );
  }
  if (!entries) {
    return (
      <UploadScreen busy={busy} error={error} onFile={onUpload} onPasteText={onPasteText} />
    );
  }
  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar
        entries={entries}
        selectedKey={selectedKey}
        step={step}
        onSelect={onSelect}
        onExport={onExport}
        onReset={onReset}
        filename={filename}
        stats={stats!}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <StepNav
          step={step}
          onChange={setStep}
          doiProgress={doiProgress}
          metaProgress={metaProgress}
        />
        {step === "doi" ? (
          <DoiStep
            entries={entries}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onDecide={onDecide}
            onAdvance={onAdvanceDoi}
            onResearch={onResearch}
          />
        ) : (
          <MetadataStep
            entries={entries}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onAcceptField={onAcceptField}
            onSkipField={onSkipField}
            onClearField={onClearField}
            onAcceptAllMeta={onAcceptAllMeta}
            onSkipAllMeta={onSkipAllMeta}
            onRefetchMeta={onRefetchMeta}
            onAdvance={onAdvanceMeta}
          />
        )}
      </div>
    </div>
  );
}

// -------- helpers --------

function ensureMeta(prev: MetaState | undefined, patch: Partial<MetaState>): MetaState {
  const base: MetaState = prev ?? { fetched: false, fetching: false, fields: {} };
  return { ...base, ...patch };
}

function setFieldDecision(
  prev: MetaState | undefined,
  field: FieldName,
  decision: FieldDecision,
): MetaState {
  const base: MetaState = prev ?? { fetched: false, fetching: false, fields: {} };
  const fields = { ...base.fields };
  if (decision.kind === "pending") {
    delete fields[field];
  } else {
    fields[field] = decision;
  }
  return { ...base, fields };
}

async function runSearch(entry: ParsedEntry): Promise<ScoredCandidate[]> {
  const title = entry.fields.title ?? "";
  const yearMatch = /^\d{4}/.exec(entry.fields.year ?? "");
  const year = yearMatch ? Number(yearMatch[0]) : null;
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

async function runWorkFetch(doi: string): Promise<CrossrefItem | null> {
  const res = await fetch("/api/work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doi }),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`work ${res.status}: ${body?.error ?? "unknown"}`);
  }
  const data = (await res.json()) as { work: CrossrefItem };
  return data.work;
}
