import type { EntryState } from "@/lib/state";
import type { Verdict } from "@/lib/scoring";
import { suggestionStatus } from "@/lib/suggestions";

export function Dot({ color, title }: { color: string; title: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
      title={title}
    />
  );
}

export function Spinner() {
  return (
    <span
      aria-label="searching"
      className="inline-block w-2.5 h-2.5 rounded-full border-2 border-[var(--muted)] border-t-transparent animate-spin"
    />
  );
}

export function DoiBadge({ state }: { state: EntryState }) {
  const { decision, searching, searched, candidates } = state;
  if (decision.kind === "had-doi") return <Dot color="var(--accent)" title="既にDOIあり" />;
  if (decision.kind === "doi") return <Dot color="var(--green)" title="承認済み" />;
  if (decision.kind === "skip") return <Dot color="var(--grey)" title="スキップ" />;
  if (searching) return <Spinner />;
  if (!searched) return <Dot color="var(--grey)" title="未検索" />;
  const top = candidates?.[0];
  if (!top) return <Dot color="var(--red)" title="候補なし" />;
  if (top.verdict === "verified") return <Dot color="var(--green)" title="自動承認候補" />;
  if (top.verdict === "likely") return <Dot color="var(--yellow)" title="要確認" />;
  return <Dot color="var(--red)" title="低確度" />;
}

export function MetaBadge({ state, hasDoi }: { state: EntryState; hasDoi: boolean }) {
  if (!hasDoi) return <Dot color="var(--grey)" title="DOI無しのためスキップ" />;
  const meta = state.meta;
  if (meta?.fetching) return <Spinner />;
  if (!meta?.fetched) return <Dot color="var(--grey)" title="未取得" />;
  if (meta.error) return <Dot color="var(--red)" title="取得エラー" />;
  const { total, decided, accepted, skipped } = suggestionStatus(state);
  if (total === 0) return <Dot color="var(--green)" title="補完候補なし" />;
  if (decided < total) {
    return (
      <Dot
        color="var(--yellow)"
        title={`未決 ${total - decided} / ${total} 件 (採用 ${accepted} · スキップ ${skipped})`}
      />
    );
  }
  // All decided: distinguish "actually filled" from "all skipped".
  if (accepted === 0) return <Dot color="var(--grey)" title="全てスキップ" />;
  return <Dot color="var(--green)" title={`採用 ${accepted} / スキップ ${skipped}`} />;
}

export function DoiLink({ doi }: { doi: string }) {
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

export function verdictLabel(v: Verdict): string {
  if (v === "verified") return "VERIFIED";
  if (v === "likely") return "LIKELY";
  return "UNCERTAIN";
}

export function verdictClass(v: Verdict): string {
  if (v === "verified") return "bg-[color-mix(in_srgb,var(--green)_25%,transparent)] text-[var(--green)]";
  if (v === "likely") return "bg-[color-mix(in_srgb,var(--yellow)_25%,transparent)] text-[var(--yellow)]";
  return "bg-[color-mix(in_srgb,var(--red)_25%,transparent)] text-[var(--red)]";
}
