"use client";

import { useEffect, useRef, useState } from "react";

export function ManualDoiInput({
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
