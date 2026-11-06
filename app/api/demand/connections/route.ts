import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { listDemandConnections } from "@/lib/demand/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thin status for Phase 4 demand adapters. Missing keys → status not_connected. */
export const GET = withRole("viewer", async () => {
  const connections = listDemandConnections();
  return NextResponse.json({
    connections,
    note: "A persona changes how the prompt is written, not who is logged in. Demand numbers are never labeled AI search volume.",
  });
});
