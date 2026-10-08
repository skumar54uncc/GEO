import { NextResponse } from "next/server";
import { getStore, storeBackend } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getStore();
  const cfg = store.getConfig();
  return NextResponse.json({
    backend: storeBackend(),
    starting_balance: cfg.serpapi_starting_balance,
    credits_remaining: cfg.serpapi_credits_remaining,
    per_run_cap: cfg.serpapi_per_run_cap,
    events: store.listSerpEvents(40),
  });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    serpapi_starting_balance?: number;
    serpapi_credits_remaining?: number;
    serpapi_per_run_cap?: number;
  };
  const config = getStore().saveConfig(body);
  return NextResponse.json({
    starting_balance: config.serpapi_starting_balance,
    credits_remaining: config.serpapi_credits_remaining,
    per_run_cap: config.serpapi_per_run_cap,
  });
}
