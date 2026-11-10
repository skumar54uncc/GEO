import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { campaigns, personas } from "@/lib/db/pg/schema";
import { WriterModelConfigError } from "@/lib/fireworks";
import { buildBuiltinFixture } from "@/lib/prompts/fixturePack";
import {
  estimatePromptGenerate,
  generateFixtureSchema,
  generateRequestSchema,
  liveGenerationConnected,
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
  /** When true (and no explicit fixture / live), build the brand-safe builtin pack. UI shows a fixture label. */
  useBuiltinFixture: z.boolean().optional(),
  /** Live Fireworks writer path. Requires key + CONTENT_MODEL ≠ JUDGE_MODEL. */
  useLive: z.boolean().optional(),
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
  if (parsed.data.action === "estimate") {
    return NextResponse.json({
      estimate,
      mode: estimate.mode,
      liveConnected: estimate.liveConnected,
      fixture_label: "fixture",
      note: estimate.liveConnected
        ? "Live generation available (Fireworks). Fixture pack remains available and labeled."
        : "Live generation not connected. Fixture pack is available and labeled.",
    });
  }

  try {
    let fixture = parsed.data.fixture;
    const useLive = Boolean(parsed.data.useLive) && !fixture;

    if (!fixture && !useLive && parsed.data.useBuiltinFixture) {
      const personaIds = request.personaIds ?? [];
      if (personaIds.length < 3 || personaIds.length > 5) {
        return NextResponse.json({ error: "Pick 3 to 5 personas for generation.", estimate }, { status: 400 });
      }
      const intents = request.intents?.length ? request.intents : (["discovery", "comparison", "evaluation", "decision"] as const);
      const rows = await db
        .select({
          id: personas.id,
          key: personas.key,
          draftPrefix: personas.draftPrefix,
        })
        .from(personas)
        .where(inArray(personas.id, personaIds));
      if (rows.length !== personaIds.length) {
        return NextResponse.json({ error: "One or more personas were not found.", estimate }, { status: 400 });
      }
      fixture = buildBuiltinFixture({
        personas: rows.map((r) => ({ id: r.id, key: r.key, opening: r.draftPrefix })),
        intents: [...intents],
      });
    }

    if (useLive && !liveGenerationConnected()) {
      return NextResponse.json(
        { error: "not connected", estimate, liveConnected: false, fixture_label: "fixture" },
        { status: 503 },
      );
    }

    const result = await runPromptGenerate(db, {
      orgId: user.orgId,
      request,
      approval: parsed.data.approval,
      fixture,
      useLive,
    });
    await recordAudit(db, {
      orgId: user.orgId,
      userId: user.userId,
      action: "prompts.generate",
      entityType: "campaign",
      entityId: params.id,
      after: {
        count: result.prompts.length,
        similar: result.similar,
        dropped: result.dropped,
        dedupeStatus: result.dedupeStatus,
        paramsHash: result.paramsHash,
        mode: result.mode,
        writerModel: result.writerModel,
        fixture: Boolean(parsed.data.useBuiltinFixture || parsed.data.fixture),
        live: useLive,
      },
    });
    return NextResponse.json({
      ...result,
      fixture_label: result.mode === "fixture_only" ? "fixture" : null,
      liveConnected: liveGenerationConnected(),
    });
  } catch (error) {
    if (error instanceof WriterModelConfigError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 503 });
    }
    if (error instanceof PromptGenerateUnavailableError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 503 });
    }
    if (error instanceof PromptGenerateApprovalError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 409 });
    }
    if (error instanceof PromptGenerateValidationError) {
      return NextResponse.json({ error: error.message, estimate }, { status: 400 });
    }
    if (error instanceof Error && /Pick 3 to 5 personas/.test(error.message)) {
      return NextResponse.json({ error: error.message, estimate }, { status: 400 });
    }
    throw error;
  }
});
