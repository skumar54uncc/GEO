import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth";
import {
  ContentAnalysisApprovalError,
  ContentAnalysisUnavailableError,
  estimateContentAnalysis,
  runContentAnalysis,
} from "@/lib/content-analysis/adapter";
import { getDb } from "@/lib/db/pg/client";
import { campaigns } from "@/lib/db/pg/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  campaignId: z.string().uuid(),
  entityNames: z.array(z.string().trim().min(1)).min(1),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});
const fixtureSchema = z.object({
  mentions: z.array(
    z.object({
      entityName: z.string(),
      url: z.url(),
      title: z.string().nullable(),
      publishedAt: z.iso.datetime().nullable(),
      sentiment: z.enum(["positive", "neutral", "negative", "mixed", "unknown"]),
    }),
  ),
});
const bodySchema = z.object({
  action: z.enum(["estimate", "run"]),
  request: requestSchema,
  approval: z
    .object({
      paramsHash: z.string().length(64),
      units: z.number().int().positive(),
      priceUsd: z.null(),
      acknowledgedUnknownPrice: z.literal(true),
    })
    .optional(),
  fixture: fixtureSchema.optional(),
});

export const POST = withRole("editor", async (req, { user }) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const db = getDb();
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, parsed.data.request.campaignId), eq(campaigns.orgId, user.orgId)));
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const estimate = estimateContentAnalysis(parsed.data.request);
  if (parsed.data.action === "estimate") return NextResponse.json({ estimate });
  try {
    return NextResponse.json(
      await runContentAnalysis(db, {
        orgId: user.orgId,
        request: parsed.data.request,
        approval: parsed.data.approval,
        fixture: parsed.data.fixture,
      }),
    );
  } catch (error) {
    if (error instanceof ContentAnalysisUnavailableError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 503 });
    }
    if (error instanceof ContentAnalysisApprovalError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 409 });
    }
    throw error;
  }
});
