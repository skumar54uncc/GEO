import { NextResponse } from "next/server";
import { withLegacyRole } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { analyzeBatch } from "@/lib/judge";
import type { JudgeJson } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withLegacyRole("viewer", async (req) => {
  const url = new URL(req.url);
  const responseId = url.searchParams.get("response_id");
  const store = getStore();
  if (responseId) {
    const response = await store.getResponse(Number(responseId));
    if (!response) return NextResponse.json({ error: "not found" }, { status: 404 });
    const analysis = await store.getAnalysisByResponse(response.id);
    const prompt = await store.getPrompt(response.prompt_id);
    return NextResponse.json({ response, analysis, prompt });
  }
  const [responses, analyses, prompts] = await Promise.all([
    store.listResponses(),
    store.listAnalyses(),
    store.listPrompts(),
  ]);
  const analysisByResponse = new Map(analyses.map((a) => [a.response_id, a]));
  const promptById = new Map(prompts.map((p) => [p.id, p]));
  const rows = responses.map((r) => ({
    response: r,
    analysis: analysisByResponse.get(r.id) ?? null,
    prompt: promptById.get(r.prompt_id) ?? null,
  }));
  return NextResponse.json({ rows });
});

export const POST = withLegacyRole("editor", async (req) => {
  const body = (await req.json()) as { response_ids?: number[]; all_unanalyzed?: boolean };
  const store = getStore();
  let ids = body.response_ids ?? [];
  if (body.all_unanalyzed) {
    ids = (await store.listResponses({ unanalyzedOnly: true })).map((r) => r.id);
  }
  const results = await analyzeBatch(ids);
  return NextResponse.json({ results });
});

export const PATCH = withLegacyRole("editor", async (req) => {
  const body = (await req.json()) as { response_id: number; judge_json: JudgeJson };
  const store = getStore();
  const existing = await store.getAnalysisByResponse(body.response_id);
  if (!existing) return NextResponse.json({ error: "no analysis to override" }, { status: 404 });
  const row = await store.upsertAnalysis({
    response_id: body.response_id,
    judge_json: JSON.stringify(body.judge_json),
    judge_model: existing.judge_model,
    error_flag: false,
    manual_override: true,
  });
  return NextResponse.json({ analysis: row });
});
