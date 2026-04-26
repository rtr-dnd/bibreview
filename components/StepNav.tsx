import type { Step } from "@/lib/state";

export function StepNav({
  step,
  onChange,
  doiProgress,
  metaProgress,
}: {
  step: Step;
  onChange: (s: Step) => void;
  doiProgress: { decided: number; total: number };
  metaProgress: { decided: number; total: number };
}) {
  return (
    <div className="flex items-stretch border-b border-[var(--border)] bg-[var(--panel)]">
      <StepButton
        active={step === "doi"}
        index={1}
        title="DOIを埋める"
        progress={doiProgress}
        onClick={() => onChange("doi")}
      />
      <StepButton
        active={step === "metadata"}
        index={2}
        title="メタデータを埋める"
        progress={metaProgress}
        onClick={() => onChange("metadata")}
      />
    </div>
  );
}

function StepButton({
  active,
  index,
  title,
  progress,
  onClick,
}: {
  active: boolean;
  index: number;
  title: string;
  progress: { decided: number; total: number };
  onClick: () => void;
}) {
  const done = progress.total > 0 && progress.decided === progress.total;
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2 text-left flex items-center gap-2 transition-colors ${
        active
          ? "bg-[var(--panel-2)] border-b-2 border-[var(--accent)]"
          : "hover:bg-[var(--panel-2)] border-b-2 border-transparent"
      }`}
    >
      <span
        className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] ${
          done
            ? "bg-[var(--green)] text-white"
            : active
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--border)] text-[var(--muted)]"
        }`}
      >
        {done ? "✓" : index}
      </span>
      <span className="text-sm font-medium">
        Step {index} · {title}
      </span>
      <span className="text-xs text-[var(--muted)] ml-auto">
        {progress.decided}/{progress.total}
      </span>
    </button>
  );
}
