import { NextResponse } from "next/server";
import { fetchAioBatch } from "@/lib/serpapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { prompt_ids: number[] };
  const ids = Array.isArray(body.prompt_ids) ? body.prompt_ids : [];
  const result = await fetchAioBatch(ids);
  if (result.refused) {
    return NextResponse.json({ refused: true, estimate: result.estimate, results: [] }, { status: 409 });
  }
  return NextResponse.json(result);
}
