import { createHash } from "crypto";
import { DEMO_ORG_NAME, DEMO_SEED_MARKER } from "@/lib/contracts";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { fidelityFor } from "@/lib/capture/types";
import type { Db } from "@/lib/db/pg/client";
import {
  brands,
  campaigns,
  citations,
  costLedger,
  draws,
  judgeRuns,
  organizations,
  prompts,
  rawPayloads,
  recommendations,
  scans,
  strategyReports,
} from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";

/**
 * Inserts a minimal Demo University dataset with every required table marked
 * `DEMO_SEED_MARKER`. Used to prove isolation tests catch contamination.
 */
export async function seedMarkedDemoOrg(db: Db): Promise<{ orgId: string; campaignId: string }> {
  const [org] = await db
    .insert(organizations)
    .values({ name: DEMO_ORG_NAME, slug: `demo-seed-${Date.now()}`, isDemo: true })
    .returning({ id: organizations.id });

  const [brand] = await db
    .insert(brands)
    .values({ orgId: org.id, name: "Demo University", rootDomain: "demo.example.test" })
    .returning({ id: brands.id });

  const [campaign] = await db
    .insert(campaigns)
    .values({
      orgId: org.id,
      brandId: brand.id,
      name: "Demo Energy",
      topic: "Demo fixture topic",
      status: "active",
      settings: {},
    })
    .returning({ id: campaigns.id });

  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const regionId = region.id;
  const [prompt] = await db
    .insert(prompts)
    .values({
      campaignId: campaign.id,
      text: "Demo seed prompt — not for UNC Charlotte",
      provenance: "custom",
      status: "approved",
    })
    .returning({ id: prompts.id });

  const { set } = await freezePromptSet(db, org.id, campaign.id);
  const [scan] = await db
    .insert(scans)
    .values({
      campaignId: campaign.id,
      promptSetId: set.id,
      name: "demo seed scan",
      kind: "scan",
      status: "complete",
      approvedAt: new Date(),
    })
    .returning({ id: scans.id });

  const payloadBody = JSON.stringify({ demo: true, marker: DEMO_SEED_MARKER, t: Date.now() });
  const sha256 = createHash("sha256").update(payloadBody).digest("hex");
  await db.insert(rawPayloads).values({
    sha256,
    content: payloadBody,
    bytes: Buffer.byteLength(payloadBody),
    storage: "inline",
    mediaType: "application/json",
    seedMarker: DEMO_SEED_MARKER,
  });

  const [draw] = await db
    .insert(draws)
    .values({
      scanId: scan.id,
      promptId: prompt.id,
      promptSetId: set.id,
      engine: "chatgpt",
      runner: "ui_provider",
      fidelity: fidelityFor("ui_provider"),
      provider: "fixture",
      regionId,
      drawIndex: 1,
      status: "ok",
      answerText: "Demo University appears in this fixture answer.",
      rawPayloadId: sha256,
      capturedAt: new Date(),
      seedMarker: DEMO_SEED_MARKER,
    })
    .returning({ id: draws.id });

  await db.insert(citations).values({
    drawId: draw.id,
    url: "https://demo.example.test/page",
    domain: "demo.example.test",
    sourceClass: "other",
  });

  await db.insert(judgeRuns).values({
    drawId: draw.id,
    judgeModel: "fixture",
    judgePromptVersion: "fixture",
    rawOutput: "{}",
  });

  await db.insert(recommendations).values({
    campaignId: campaign.id,
    kind: "gap",
    leverType: "on_page",
    owner: "demo",
    evidenceGrade: "C",
    status: "open",
    payload: { format: "demo", headlineTerms: [] },
    evidence: { rows: [] },
    targetPromptIds: [prompt.id],
    seedMarker: DEMO_SEED_MARKER,
  });

  await db.insert(strategyReports).values({
    campaignId: campaign.id,
    topic: "demo topic",
    inputs: { demo: true },
    output: { scoredItems: [], unscoredItems: [], offsite: [] },
    seedMarker: DEMO_SEED_MARKER,
  });

  await db.insert(costLedger).values({
    orgId: org.id,
    provider: "fixture",
    scanId: scan.id,
    drawId: draw.id,
    units: "1",
    usd: "0",
    ok: true,
    seedMarker: DEMO_SEED_MARKER,
  });

  return { orgId: org.id, campaignId: campaign.id };
}
