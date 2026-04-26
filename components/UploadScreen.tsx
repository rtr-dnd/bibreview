"use client";

import { useState } from "react";

export function UploadScreen({
  busy,
  error,
  onFile,
}: {
  busy: boolean;
  error: string | null;
  onFile: (f: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="flex flex-1 items-center justify-center min-h-screen p-8">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-semibold mb-2">Bib Review</h1>
        <p className="text-sm text-[var(--muted)] mb-4">
          .bibファイルをアップロードして、2ステップで参考文献を整えます。
        </p>
        <ol className="text-sm text-[var(--muted)] mb-6 list-decimal pl-5 space-y-1">
          <li>
            <span className="text-[var(--foreground)]">Step 1 · DOIを埋める</span>
            : DOIが無いエントリにCrossRefから候補を提示し、レビューして確定します。
          </li>
          <li>
            <span className="text-[var(--foreground)]">Step 2 · メタデータを埋める</span>
            : 確定したDOIから`journal`/`publisher`/`pages`等を補完。DOIが無いエントリは対象外です。
          </li>
        </ol>
        <label
          className={`block border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            drag
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
              : "border-[var(--border)]"
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
