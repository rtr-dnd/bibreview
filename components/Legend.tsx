import { Spinner } from "@/components/Badges";

type Item = { color: string; label: string };

const DOI_ITEMS: Item[] = [
  { color: "var(--accent)", label: "既存DOI" },
  { color: "var(--green)", label: "承認 / 自動承認候補" },
  { color: "var(--yellow)", label: "要確認 (likely)" },
  { color: "var(--red)", label: "低確度 / 候補なし" },
  { color: "var(--grey)", label: "未検索 / スキップ" },
];

const META_ITEMS: Item[] = [
  { color: "var(--green)", label: "1件以上採用済み / 補完候補なし" },
  { color: "var(--yellow)", label: "未決定の候補あり" },
  { color: "var(--red)", label: "取得エラー" },
  { color: "var(--grey)", label: "DOI無し / 未取得 / 全てスキップ" },
];

export function Legend({ step }: { step: "doi" | "metadata" }) {
  const items = step === "doi" ? DOI_ITEMS : META_ITEMS;
  return (
    <details className="mt-2 text-[11px] text-[var(--muted)]">
      <summary className="cursor-pointer select-none hover:text-[var(--foreground)]">凡例</summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: it.color }}
            />
            <span>{it.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <Spinner />
          <span>処理中</span>
        </li>
      </ul>
      {step === "doi" && (
        <div className="mt-2 leading-relaxed">
          候補カードのバッジ:{" "}
          <span className="px-1 rounded bg-[color-mix(in_srgb,var(--green)_25%,transparent)] text-[var(--green)]">
            VERIFIED
          </span>{" "}
          ·{" "}
          <span className="px-1 rounded bg-[color-mix(in_srgb,var(--yellow)_25%,transparent)] text-[var(--yellow)]">
            LIKELY
          </span>{" "}
          ·{" "}
          <span className="px-1 rounded bg-[color-mix(in_srgb,var(--red)_25%,transparent)] text-[var(--red)]">
            UNCERTAIN
          </span>
        </div>
      )}
    </details>
  );
}
