"use client";

import { useEffect, useRef, useState } from "react";

export function UploadScreen({
  busy,
  error,
  onFile,
  onPasteText,
}: {
  busy: boolean;
  error: string | null;
  onFile: (f: File) => void;
  onPasteText: (text: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global paste shortcut: Cmd/Ctrl+V on the upload screen ingests the
  // clipboard text as .bib. Skip when busy, and never intercept paste
  // targeted at an editable element (inputs/textareas).
  useEffect(() => {
    if (busy) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (editable) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      e.preventDefault();
      if (!looksLikeBib(text)) {
        setLocalError("クリップボードの内容はBibTeXとして解釈できませんでした。");
        return;
      }
      setLocalError(null);
      onPasteText(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [busy, onPasteText]);

  const displayError = error ?? localError;
  const clearLocalError = () => setLocalError(null);

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

        <button
          type="button"
          disabled={busy}
          aria-label=".bibをアップロードまたはドロップ"
          onClick={() => {
            clearLocalError();
            fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            clearLocalError();
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          className={`block w-full border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
            drag
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
              : "border-[var(--border)] hover:bg-[var(--panel)]"
          }`}
        >
          <div className="text-base mb-1">{busy ? "処理中…" : ".bib をドロップ"}</div>
          <div className="text-xs text-[var(--muted)]">またはクリックして選択</div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".bib,text/x-bibtex,application/x-bibtex,text/plain"
          className="hidden"
          onChange={(e) => {
            clearLocalError();
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />

        <div className="text-xs py-2 text-center text-[var(--muted)] opacity-60">
          ⌘V / Ctrl+V でクリップボードから取り込めます
        </div>

        {displayError && <div className="mt-4 text-sm text-[var(--red)]">{displayError}</div>}
      </div>
    </div>
  );
}

function looksLikeBib(text: string): boolean {
  // Tolerant heuristic: at least one BibTeX entry header.
  return /@\w{2,}\s*\{/.test(text);
}
