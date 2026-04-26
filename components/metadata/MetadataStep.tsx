"use client";

import { useEffect, useMemo } from "react";
import type { EntryState } from "@/lib/state";
import { resolvedDoi } from "@/lib/state";
import type { FieldName } from "@/lib/fields";
import { FIELD_LABELS, RECOMMENDED_FIELDS } from "@/lib/fields";
import { computeSuggestions } from "@/lib/suggestions";
import { DoiLink } from "@/components/Badges";
import { MetadataFieldCard } from "@/components/metadata/MetadataField";

export function MetadataStep({
  entries,
  selectedKey,
  onSelect,
  onAcceptField,
  onSkipField,
  onClearField,
  onAcceptAllMeta,
  onSkipAllMeta,
  onRefetchMeta,
  onAdvance,
}: {
  entries: EntryState[];
  selectedKey: string | null;
  onSelect: (k: string) => void;
  onAcceptField: (key: string, field: FieldName, value: string) => void;
  onSkipField: (key: string, field: FieldName) => void;
  onClearField: (key: string, field: FieldName) => void;
  onAcceptAllMeta: (key: string) => void;
  onSkipAllMeta: (key: string) => void;
  onRefetchMeta: (key: string) => void;
  onAdvance: () => void;
}) {
  const state = entries.find((s) => s.entry.key === selectedKey) ?? null;
  const suggestions = useMemo(() => (state ? computeSuggestions(state) : []), [state]);

  useEffect(() => {
    if (!state) return;
    const handler = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const editable =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editable) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const key = state.entry.key;

      if (ev.key === "Enter" || ev.key === "a") {
        if (suggestions.length > 0) onAcceptAllMeta(key);
        onAdvance();
        ev.preventDefault();
      } else if (ev.key === "s") {
        if (suggestions.length > 0) onSkipAllMeta(key);
        onAdvance();
        ev.preventDefault();
      } else if (/^[1-9]$/.test(ev.key)) {
        const idx = Number(ev.key) - 1;
        const sg = suggestions[idx];
        if (sg) {
          onAcceptField(key, sg.field, sg.suggested);
          ev.preventDefault();
        }
      } else if (ev.key === "r") {
        onRefetchMeta(key);
        ev.preventDefault();
      } else if (ev.key === "j" || ev.key === "ArrowDown") {
        const i = entries.findIndex((s) => s.entry.key === key);
        const next = entries[Math.min(entries.length - 1, i + 1)];
        if (next) {
          ev.preventDefault();
          onSelect(next.entry.key);
        }
      } else if (ev.key === "k" || ev.key === "ArrowUp") {
        const i = entries.findIndex((s) => s.entry.key === key);
        const next = entries[Math.max(0, i - 1)];
        if (next) {
          ev.preventDefault();
          onSelect(next.entry.key);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    state,
    entries,
    suggestions,
    onSelect,
    onAcceptField,
    onAcceptAllMeta,
    onSkipAllMeta,
    onRefetchMeta,
    onAdvance,
  ]);

  if (!state) {
    return <main className="flex-1 p-8 text-[var(--muted)]">エントリを選択してください</main>;
  }
  return (
    <MetadataDetail
      state={state}
      entries={entries}
      suggestions={suggestions}
      onAcceptField={onAcceptField}
      onSkipField={onSkipField}
      onClearField={onClearField}
      onAcceptAllMeta={onAcceptAllMeta}
      onSkipAllMeta={onSkipAllMeta}
      onRefetchMeta={onRefetchMeta}
      onAdvance={onAdvance}
    />
  );
}

function MetadataDetail({
  state,
  entries,
  suggestions,
  onAcceptField,
  onSkipField,
  onClearField,
  onAcceptAllMeta,
  onSkipAllMeta,
  onRefetchMeta,
  onAdvance,
}: {
  state: EntryState;
  entries: EntryState[];
  suggestions: ReturnType<typeof computeSuggestions>;
  onAcceptField: (key: string, field: FieldName, value: string) => void;
  onSkipField: (key: string, field: FieldName) => void;
  onClearField: (key: string, field: FieldName) => void;
  onAcceptAllMeta: (key: string) => void;
  onSkipAllMeta: (key: string) => void;
  onRefetchMeta: (key: string) => void;
  onAdvance: () => void;
}) {
  const { entry, meta } = state;
  const doi = resolvedDoi(state);

  const idx = entries.findIndex((s) => s.entry.key === entry.key);
  const nav = `${idx + 1} / ${entries.length}`;
  const pendingCount = suggestions.filter((s) => {
    const fd = meta?.fields[s.field];
    return !fd || fd.kind === "pending";
  }).length;

  if (!doi) {
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
          <div className="mt-6 p-3 rounded border border-[var(--border)] bg-[var(--panel)] text-sm text-[var(--muted)]">
            このエントリにはDOIが付いていないため、Step 2 では対象外です。Step 1 で再検索するか、手で
            <span className="mono"> publisher / address / journal </span>
            を埋めてください。
          </div>
        </div>
      </main>
    );
  }

  const recommended = RECOMMENDED_FIELDS[entry.type] ?? [];

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
        <div className="mt-2 text-sm">
          DOI: <DoiLink doi={doi} />
        </div>

        <section className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold">補完候補</h3>
            {meta?.fetching && <span className="text-xs text-[var(--muted)]">取得中…</span>}
            {meta?.error && <span className="text-xs text-[var(--red)]">エラー: {meta.error}</span>}
            <button
              onClick={() => onRefetchMeta(entry.key)}
              disabled={meta?.fetching}
              className="ml-auto text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--panel)] disabled:opacity-50"
            >
              {meta?.fetched || meta?.error ? "再取得" : "取得"}
            </button>
          </div>

          {!meta?.fetched && !meta?.fetching && !meta?.error && (
            <div className="text-sm text-[var(--muted)]">未取得</div>
          )}
          {meta?.fetched && !meta?.error && suggestions.length === 0 && (
            <div className="text-sm text-[var(--muted)]">
              CrossRefの記録から補完できる項目はありません（
              {recommended.length > 0
                ? `推奨フィールド ${recommended.map((f) => FIELD_LABELS[f]).join("/")} は埋まっているか、CrossRef側に該当データがありません`
                : "このエントリ型に対する推奨フィールドの設定はありません"}
              ）。
            </div>
          )}

          <ul className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <MetadataFieldCard
                key={s.field}
                index={i + 1}
                field={s.field}
                current={s.current}
                suggestion={s.suggested}
                decision={meta?.fields[s.field]}
                onAccept={() => onAcceptField(entry.key, s.field, s.suggested)}
                onSkip={() => onSkipField(entry.key, s.field)}
                onClear={() => onClearField(entry.key, s.field)}
              />
            ))}
          </ul>
        </section>

        {suggestions.length > 0 && (
          <section className="mt-4 flex flex-wrap gap-2">
            <button
              className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel)] disabled:opacity-50"
              disabled={pendingCount === 0}
              onClick={() => {
                onAcceptAllMeta(entry.key);
                onAdvance();
              }}
            >
              全て採用 (Enter / a)
            </button>
            <button
              className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel)] disabled:opacity-50"
              disabled={pendingCount === 0}
              onClick={() => {
                onSkipAllMeta(entry.key);
                onAdvance();
              }}
            >
              全てスキップ (s)
            </button>
            <button
              className="text-sm px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--panel)]"
              onClick={() => onRefetchMeta(entry.key)}
            >
              再取得 (r)
            </button>
          </section>
        )}

        <section className="mt-8">
          <div className="text-xs text-[var(--muted)] mb-1">原文 (BibTeX)</div>
          <pre className="text-xs mono p-3 rounded bg-[var(--panel)] border border-[var(--border)] whitespace-pre-wrap break-words">
            {entry.raw}
          </pre>
        </section>

        <section className="mt-6 text-xs text-[var(--muted)]">
          ショートカット: Enterまたはaで全採用 / sで全スキップ / 1〜9で個別採用 / rで再取得 / ↑↓またはJ/Kで前後移動
        </section>
      </div>
    </main>
  );
}
