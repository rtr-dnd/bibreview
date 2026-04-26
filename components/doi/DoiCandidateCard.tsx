import type { ScoredCandidate } from "@/lib/scoring";
import { verdictClass, verdictLabel } from "@/components/Badges";

export function DoiCandidateCard({
  index,
  cand,
  queryTitleTokens,
  queryAuthorLasts,
  queryYear,
  onAccept,
}: {
  index: number;
  cand: ScoredCandidate;
  queryTitleTokens: Set<string>;
  queryAuthorLasts: Set<string>;
  queryYear: number | null;
  onAccept: () => void;
}) {
  return (
    <li className="border border-[var(--border)] rounded p-3 bg-[var(--panel-2)]">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${verdictClass(cand.verdict)}`}>
          {verdictLabel(cand.verdict)}
        </span>
        <span className="text-xs text-[var(--muted)]">#{index}</span>
        <span className="text-xs text-[var(--muted)]">
          combined {Math.round(cand.combined * 100)} · title{" "}
          {Math.round(cand.titleSim * 100)} · author {Math.round(cand.authorOverlap * 100)} · year{" "}
          {cand.yearDiff ?? "?"}
        </span>
        <button
          className="ml-auto text-xs px-2 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90"
          onClick={onAccept}
        >
          採用 ({index})
        </button>
      </div>
      <div className="text-sm font-medium break-words">
        {highlightTitle(cand.title, queryTitleTokens)}
      </div>
      <div className="text-xs text-[var(--muted)] mt-1 break-words">
        {cand.authors.map((a, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <AuthorName a={a} known={queryAuthorLasts.has((a.family ?? "").toLowerCase())} />
          </span>
        ))}
      </div>
      <div className="text-xs text-[var(--muted)] mt-0.5">
        {cand.container || "—"} ·{" "}
        <span
          className={
            cand.year && queryYear && Math.abs(cand.year - queryYear) > 1
              ? "text-[var(--red)]"
              : ""
          }
        >
          {cand.year ?? "?"}
        </span>{" "}
        · {cand.type}
      </div>
      <div className="text-xs mono mt-1 break-all">
        <a href={`https://doi.org/${cand.doi}`} target="_blank" rel="noreferrer">
          {cand.doi}
        </a>
      </div>
    </li>
  );
}

function AuthorName({
  a,
  known,
}: {
  a: { given?: string; family?: string };
  known: boolean;
}) {
  const text = `${a.given ?? ""} ${a.family ?? ""}`.trim();
  return (
    <span
      className={known ? "px-1 rounded" : undefined}
      style={known ? { backgroundColor: "var(--diff-add-bg)" } : undefined}
    >
      {text}
    </span>
  );
}

function highlightTitle(title: string, queryTokens: Set<string>) {
  const cleaned = title.replace(/<[^>]+>/g, "");
  const parts = cleaned.split(/(\s+)/);
  return parts.map((p, i) => {
    if (/^\s+$/.test(p)) return <span key={i}>{p}</span>;
    const norm = p.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const known = norm.length >= 2 && queryTokens.has(norm);
    return (
      <span key={i} style={known ? { backgroundColor: "var(--diff-add-bg)" } : undefined}>
        {p}
      </span>
    );
  });
}
