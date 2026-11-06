import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { campaigns } from "@/lib/db/pg/schema";
import {
  estimatePromptGenerate,
  generateFixtureSchema,
  generateRequestSchema,
  PromptGenerateApprovalError,
  PromptGenerateUnavailableError,
  PromptGenerateValidationError,
  runPromptGenerate,
} from "@/lib/prompts/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["estimate", "run"]),
  request: generateRequestSchema.omit({ campaignId: true }).optional(),
  approval: z
    .object({
      paramsHash: z.string().length(64),
      units: z.number().int().positive(),
      priceUsd: z.null(),
      acknowledgedUnknownPrice: z.literal(true),
    })
    .optional(),
  fixture: generateFixtureSchema.optional(),
});

export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = getDb();
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, params.id), eq(campaigns.orgId, user.orgId)));
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const request = generateRequestSchema.parse({
    campaignId: params.id,
    ...(parsed.data.request ?? {}),
  });
  const estimate = estimatePromptGenerate(request);
  if (parsed.data.action === "estimate") return NextResponse.json({ estimate });

  try {
    const result = await runPromptGenerate(db, {
      orgId: user.orgId,
      request,
      approval: parsed.data.approval,
      fixture: parsed.data.fixture,
    });
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "prompts.generate",
      entityType: "campaign",
      entityId: params.id,
      after: {
        count: result.prompts.length,
        dropped: result.dropped,
        dedupeStatus: result.dedupeStatus,
        paramsHash: result.paramsHash,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PromptGenerateUnavailableError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 503 });
    }
    if (error instanceof PromptGenerateApprovalError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 409 });
    }
    if (error instanceof PromptGenerateValidationError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 400 });
    }
    throw error;
  }
});
