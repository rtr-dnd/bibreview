import type { FieldDecision } from "@/lib/state";
import type { FieldName } from "@/lib/fields";
import { FIELD_LABELS } from "@/lib/fields";

export function MetadataFieldCard({
  index,
  field,
  current,
  suggestion,
  decision,
  onAccept,
  onSkip,
  onClear,
}: {
  index: number;
  field: FieldName;
  current: string;
  suggestion: string;
  decision: FieldDecision | undefined;
  onAccept: () => void;
  onSkip: () => void;
  onClear: () => void;
}) {
  const decided = decision && decision.kind !== "pending";
  return (
    <li className="border border-[var(--border)] rounded p-3 bg-[var(--panel-2)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-[var(--muted)]">#{index}</span>
        <span className="text-xs mono px-1.5 py-0.5 rounded bg-[var(--panel)] text-[var(--muted)]">
          {FIELD_LABELS[field]}
        </span>
        {decision?.kind === "accept" && (
          <span className="text-xs text-[var(--green)]">✓ 採用</span>
        )}
        {decision?.kind === "skip" && (
          <span className="text-xs text-[var(--muted)]">— スキップ</span>
        )}
        <div className="ml-auto flex gap-1">
          {!decided && (
            <>
              <button
                className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90"
                onClick={onAccept}
              >
                採用 ({index})
              </button>
              <button
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--panel)]"
                onClick={onSkip}
              >
                スキップ
              </button>
            </>
          )}
          {decided && (
            <button
              className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--panel)]"
              onClick={onClear}
            >
              戻す
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-[var(--muted)] mb-0.5">現在</div>
          <div
            className="px-2 py-1.5 rounded border border-dashed border-[var(--border)] mono break-words min-h-[1.8em]"
            style={current ? undefined : { color: "var(--muted)" }}
          >
            {current || "(空)"}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-[var(--muted)] mb-0.5">CrossRef</div>
          <div
            className="px-2 py-1.5 rounded border border-[var(--green)] mono break-words"
            style={{ backgroundColor: "var(--diff-add-bg)" }}
          >
            {suggestion}
          </div>
        </div>
      </div>
    </li>
  );
}
