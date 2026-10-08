import { NextResponse } from "next/server";
import { estimateDemandPack, fetchDemandPack, loadDemandSnapshot } from "@/lib/demand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    estimate: estimateDemandPack(),
    snapshot: loadDemandSnapshot(),
  });
}

export async function POST() {
  const estimate = estimateDemandPack();
  if (!estimate.allowed) {
    return NextResponse.json({ refused: true, estimate, snapshot: loadDemandSnapshot() }, { status: 409 });
  }
  const result = await fetchDemandPack();
  return NextResponse.json({
    ...result,
    snapshot: loadDemandSnapshot(),
  });
}
