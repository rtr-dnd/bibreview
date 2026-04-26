import { NextRequest } from "next/server";
import { applyEntryEdits, parseBib } from "@/lib/bib";
import type { ExportRequest, ExportResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ExportRequest;
  const source = body.source ?? "";
  const edits = body.edits ?? {};
  if (!source) return Response.json({ error: "source missing" }, { status: 400 });
  const parsed = parseBib(source);
  const bib = applyEntryEdits(parsed, edits);
  const payload: ExportResponse = { bib };
  return Response.json(payload);
}
