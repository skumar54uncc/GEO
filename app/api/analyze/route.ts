import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { analyzeBatch } from "@/lib/judge";
import type { JudgeJson } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const responseId = url.searchParams.get("response_id");
  const store = getStore();
  if (responseId) {
    const response = store.getResponse(Number(responseId));
    if (!response) return NextResponse.json({ error: "not found" }, { status: 404 });
    const analysis = store.getAnalysisByResponse(response.id);
    const prompt = store.getPrompt(response.prompt_id);
    return NextResponse.json({ response, analysis, prompt });
  }
  const rows = store.listResponses().map((r) => {
    const analysis = store.getAnalysisByResponse(r.id);
    const prompt = store.getPrompt(r.prompt_id);
    return { response: r, analysis, prompt };
  });
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { response_ids?: number[]; all_unanalyzed?: boolean };
  const store = getStore();
  let ids = body.response_ids ?? [];
  if (body.all_unanalyzed) {
    ids = store.listResponses({ unanalyzedOnly: true }).map((r) => r.id);
  }
  const results = await analyzeBatch(ids);
  return NextResponse.json({ results });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { response_id: number; judge_json: JudgeJson };
  const store = getStore();
  const existing = store.getAnalysisByResponse(body.response_id);
  if (!existing) return NextResponse.json({ error: "no analysis to override" }, { status: 404 });
  const row = store.upsertAnalysis({
    response_id: body.response_id,
    judge_json: JSON.stringify(body.judge_json),
    judge_model: existing.judge_model,
    error_flag: false,
    manual_override: true,
  });
  return NextResponse.json({ analysis: row });
}
