"use client";

import { useEffect, useMemo, useState } from "react";
import { authorLastNames } from "@/lib/bib";
import type { Decision, EntryState } from "@/lib/state";
import { DoiLink } from "@/components/Badges";
import { DoiCandidateCard } from "@/components/doi/DoiCandidateCard";
import { ManualDoiInput } from "@/components/doi/ManualDoiInput";
import { tokenSet } from "@/components/highlight";

export function DoiStep({
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

  // Keyboard shortcuts (depend on the current entry's candidate set).
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
    <DoiDetail
      state={state}
      entries={entries}
      onDecide={onDecide}
      onAdvance={onAdvance}
      onResearch={onResearch}
    />
  );
}

function DoiDetail({
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
          <div className="text-xs text-[var(--muted)] mt-0.5">
            booktitle: {entry.fields.booktitle}
          </div>
        )}

        <DecisionBanner state={state} onResearch={onResearch} />

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
            <div className="text-sm text-[var(--muted)]">
              候補なし。CrossRefにDOIが存在しない可能性が高いです（書籍・ブログ・古い雑誌記事など）。
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {candidates?.map((c, i) => (
              <DoiCandidateCard
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
  onResearch,
}: {
  state: EntryState;
  onResearch: (key: string) => void;
}) {
  const { decision, entry } = state;
  if (decision.kind === "had-doi") {
    return (
      <div className="mt-4 p-3 rounded border border-[var(--border)] bg-[var(--panel)] text-sm flex items-center gap-3">
        <span className="text-[var(--accent)]">●</span>
        <div className="flex-1 min-w-0">
          このエントリには既にDOIがあります: <DoiLink doi={decision.doi} />
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
        <span className="text-[var(--green)]">✓</span> 承認済み: <DoiLink doi={decision.doi} />{" "}
        <span className="text-[var(--muted)]">
          ({decision.from === "manual" ? "手入力" : "候補から"})
        </span>
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
