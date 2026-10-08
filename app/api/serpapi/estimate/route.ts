import { NextResponse } from "next/server";
import { estimateAioBatch } from "@/lib/serpapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { prompt_ids: number[] };
  const ids = Array.isArray(body.prompt_ids) ? body.prompt_ids : [];
  return NextResponse.json(estimateAioBatch(ids));
}
