import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { estimateDemandPack, fetchDemandPack, loadDemandSnapshot } from "@/lib/demand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole("viewer", async () => {
  return NextResponse.json({
    estimate: await estimateDemandPack(),
    snapshot: await loadDemandSnapshot(),
  });
});

export const POST = withRole("editor", async () => {
  const estimate = await estimateDemandPack();
  if (!estimate.allowed) {
    return NextResponse.json({ refused: true, estimate, snapshot: await loadDemandSnapshot() }, { status: 409 });
  }
  const result = await fetchDemandPack();
  return NextResponse.json({
    ...result,
    snapshot: await loadDemandSnapshot(),
  });
});
