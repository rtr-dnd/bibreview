import { NextRequest } from "next/server";
import { existingDoi, parseBib } from "@/lib/bib";
import type { ParseResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let source: string;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json()) as { source?: string };
    source = body.source ?? "";
  } else {
    source = await req.text();
  }
  if (!source.trim()) {
    return Response.json({ error: "empty input" }, { status: 400 });
  }
  const parsed = parseBib(source);
  const entries = parsed.entries.map((e) => ({
    key: e.key,
    type: e.type,
    fields: e.fields,
    raw: e.raw,
    existingDoi: existingDoi(e),
  }));
  const withDoi = entries.filter((e) => e.existingDoi).length;
  const payload: ParseResponse = {
    source: parsed.source,
    entries,
    stats: { total: entries.length, withDoi, missing: entries.length - withDoi },
  };
  return Response.json(payload);
}
