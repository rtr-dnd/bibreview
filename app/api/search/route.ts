import { NextRequest } from "next/server";
import { searchWorks } from "@/lib/crossref";
import { scoreCandidate } from "@/lib/scoring";
import type { SearchRequest, SearchResponse } from "@/lib/types";

export const runtime = "nodejs";
// CrossRef calls can take a few seconds; allow more headroom.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as SearchRequest & { authorLastNames?: string[] };
  const title = (body.title ?? "").trim();
  const author = (body.author ?? "").trim();
  const year = body.year ?? null;
  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  let items;
  try {
    items = await searchWorks({ title, author, year });
  } catch (err) {
    console.error("[search] CrossRef failure", { title, author, year, err: String(err) });
    return Response.json({ error: String(err) }, { status: 502 });
  }
  const lastNames = body.authorLastNames?.length
    ? body.authorLastNames
    : author
      ? [author]
      : [];
  const scored = items
    .map((it) => scoreCandidate({ title, authorLastNames: lastNames, year }, it))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.combined - a.combined);

  const payload: SearchResponse = { candidates: scored };
  return Response.json(payload);
}
