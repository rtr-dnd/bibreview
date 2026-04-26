import { NextRequest } from "next/server";
import { getWork } from "@/lib/crossref";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { doi?: string };
  const doi = body.doi?.trim();
  if (!doi) return Response.json({ error: "doi required" }, { status: 400 });
  try {
    const work = await getWork(doi);
    if (!work) return Response.json({ work: null }, { status: 404 });
    return Response.json({ work });
  } catch (err) {
    console.error("[work] CrossRef failure:", String(err));
    return Response.json({ error: String(err) }, { status: 502 });
  }
}
