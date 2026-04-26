import { firstAuthorLastName } from "@/lib/bib";
import type { EntryState, Step } from "@/lib/state";
import { resolvedDoi } from "@/lib/state";
import { DoiBadge, MetaBadge } from "@/components/Badges";

export function EntryRow({
  state,
  selected,
  step,
  onClick,
}: {
  state: EntryState;
  selected: boolean;
  step: Step;
  onClick: () => void;
}) {
  const { entry, decision } = state;
  const doi = resolvedDoi(state);
  return (
    <button
      data-key={entry.key}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--panel-2)] ${
        selected ? "bg-[var(--panel-2)]" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {step === "doi" ? <DoiBadge state={state} /> : <MetaBadge state={state} hasDoi={!!doi} />}
        <div className="font-medium text-sm truncate">{entry.key}</div>
      </div>
      <div className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">
        {entry.fields.title || "(no title)"}
      </div>
      <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
        {firstAuthorLastName(entry.fields.author) || "—"} · {entry.fields.year || "—"} · {entry.type}
      </div>
      {step === "doi" && decision.kind === "doi" && (
        <div className="text-[11px] mono text-[var(--green)] mt-0.5 truncate">→ {decision.doi}</div>
      )}
      {step === "doi" && decision.kind === "had-doi" && (
        <div className="text-[11px] mono text-[var(--accent)] mt-0.5 truncate">→ {decision.doi}</div>
      )}
      {step === "metadata" && doi && (
        <div className="text-[11px] mono text-[var(--muted)] mt-0.5 truncate">→ {doi}</div>
      )}
    </button>
  );
}
