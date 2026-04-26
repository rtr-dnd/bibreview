"use client";

import { useEffect, useRef } from "react";
import type { EntryState, Step } from "@/lib/state";
import { EntryRow } from "@/components/EntryRow";
import { Legend } from "@/components/Legend";

export type Stats = {
  total: number;
  withDoi: number;
  decided: number;
  skipped: number;
  undecided: number;
};

export function Sidebar({
  entries,
  selectedKey,
  step,
  onSelect,
  onExport,
  onReset,
  filename,
  stats,
}: {
  entries: EntryState[];
  selectedKey: string | null;
  step: Step;
  onSelect: (k: string) => void;
  onExport: () => void;
  onReset: () => void;
  filename: string;
  stats: Stats;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-key="${CSS.escape(selectedKey ?? "")}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  return (
    <aside className="w-[340px] shrink-0 border-r border-[var(--border)] bg-[var(--panel)] flex flex-col h-screen sticky top-0">
      <header className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Bib Review</div>
          {filename && (
            <div className="text-xs text-[var(--muted)] truncate flex-1 min-w-0">{filename}</div>
          )}
          <button
            onClick={onReset}
            title="新しい.bibファイルを取り込む（現在の進捗は破棄）"
            className="text-xs px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--panel-2)] shrink-0"
          >
            新規
          </button>
        </div>
        <div className="mt-2 text-xs text-[var(--muted)] flex flex-wrap gap-x-3 gap-y-1">
          <span>合計 {stats.total}</span>
          <span>既存DOI {stats.withDoi}</span>
          <span>未決 {stats.undecided}</span>
          <span>決定 {stats.decided}</span>
          <span>スキップ {stats.skipped}</span>
        </div>
        <button
          className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90"
          onClick={onExport}
        >
          .bibを書き出す
        </button>
        <Legend step={step} />
      </header>
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {entries.map((s) => (
          <EntryRow
            key={s.entry.key}
            state={s}
            selected={s.entry.key === selectedKey}
            step={step}
            onClick={() => onSelect(s.entry.key)}
          />
        ))}
      </div>
    </aside>
  );
}
