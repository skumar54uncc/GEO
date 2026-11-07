import fs from "fs";
import os from "os";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPECTED_NEUTRAL, EXPECTED_VARIANTS, importContentTeamCsv } from "@/lib/contentTeam/import";
import { IMPORT_TAG } from "@/lib/contentTeam/personas";
import { seedContentTeam } from "@/lib/contentTeam/seed";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { campaigns, prompts } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-content-team-"));
const CSV = path.join(fixtureDir, "content_team_prompts_fixture.csv");

function writeSyntheticCsv(): void {
  const header = [
    "prompt_id",
    "pillar",
    "question_id",
    "region",
    "branded",
    "text",
    "doc_personas",
    "suggested_personas",
    "note",
  ].join(",");
  const rows = Array.from({ length: EXPECTED_NEUTRAL }, (_, index) => {
    const number = index + 1;
    const pillar = ["AI", "Energy", "Internships"][index % 3];
    const promptId = index === 10 ? "IN11" : `FIX${String(number).padStart(3, "0")}`;
    const personas =
      index < 105
        ? "undergrad;grad;business_partner"
        : "undergrad;research_partner";
    return [
      promptId,
      pillar,
      index === 10 ? "IN11" : `Q${String(number).padStart(3, "0")}`,
      "Charlotte",
      index === 10 ? "true" : "false",
      `Synthetic fixture prompt ${number}`,
      "content team",
      personas,
      "",
    ].join(",");
  });
  fs.writeFileSync(CSV, [header, ...rows].join("\n"));
}

describe("content-team prompt import", () => {
  let orgId: string;

  beforeAll(async () => {
    writeSyntheticCsv();
    const db = getDb();
    ({ orgId } = await legacyContext(db));
  });

  afterAll(async () => {
    await closeDb();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("seeds personas and campaigns without touching legacy Energy", async () => {
    const db = getDb();
    const seeded = await seedContentTeam(db, orgId);
    expect(seeded.personas).toHaveLength(5);
    expect(seeded.campaigns.map((c) => c.name).sort()).toEqual(["AI", "Energy", "Internships"]);
    const legacy = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.orgId, orgId),
          sql`coalesce((${campaigns.settings}->>'legacy')::boolean, false) = true`,
          sql`${campaigns.name} like 'Energy%'`,
        ),
      );
    expect(legacy.length).toBeGreaterThanOrEqual(1);
    expect(legacy[0].name).toBe("Energy (legacy captures)");
    const contentEnergy = seeded.campaigns.find((c) => c.name === "Energy")!;
    expect(contentEnergy.id).not.toBe(legacy[0].id);
  });

  it("imports 118 neutrals and 341 variants, idempotently", async () => {
    const db = getDb();
    const first = await importContentTeamCsv(db, orgId, CSV);
    expect(first.neutral).toBe(EXPECTED_NEUTRAL);
    expect(first.variants).toBe(EXPECTED_VARIANTS);
    expect(first.perCampaign.AI.neutral + first.perCampaign.Energy.neutral + first.perCampaign.Internships.neutral).toBe(118);
    expect(first.perCampaign.AI.variants + first.perCampaign.Energy.variants + first.perCampaign.Internships.variants).toBe(341);

    const second = await importContentTeamCsv(db, orgId, CSV);
    expect(second.insertedNeutral).toBe(0);
    expect(second.insertedVariants).toBe(0);
    expect(second.neutral).toBe(EXPECTED_NEUTRAL);
    expect(second.variants).toBe(EXPECTED_VARIANTS);

    const [in11] = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.externalId, "IN11"), sql`${IMPORT_TAG} = any(${prompts.tags})`));
    expect(in11?.branded).toBe(true);
    expect(in11?.tags).toContain("qid:IN11");
  });

  it("core freeze excludes persona variants", async () => {
    const db = getDb();
    const seeded = await seedContentTeam(db, orgId);
    const ai = seeded.campaigns.find((c) => c.name === "AI")!;
    // Approve one neutral and one variant for the freeze filter test.
    const neutrals = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.campaignId, ai.id), sql`${prompts.personaId} is null`))
      .limit(1);
    const variants = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.campaignId, ai.id), sql`${prompts.personaId} is not null`))
      .limit(1);
    expect(neutrals[0] && variants[0]).toBeTruthy();
    await db.update(prompts).set({ status: "approved" }).where(eq(prompts.id, neutrals[0].id));
    await db.update(prompts).set({ status: "approved" }).where(eq(prompts.id, variants[0].id));

    const core = await freezePromptSet(db, orgId, ai.id, { filter: "core", label: "AI-core-v1-test" });
    expect(core.itemCount).toBeGreaterThanOrEqual(1);
    const items = await db.execute(sql`
      select p.persona_id is null as is_neutral
      from prompt_set_items i
      join prompts p on p.id = i.prompt_id
      where i.prompt_set_id = ${core.set.id}
    `);
    expect(items.rows.every((r) => Boolean(r.is_neutral))).toBe(true);

    const persona = await freezePromptSet(db, orgId, ai.id, { filter: "persona", label: "AI-persona-v1-test" });
    expect(persona.itemCount).toBeGreaterThanOrEqual(1);
    const pItems = await db.execute(sql`
      select p.persona_id is not null as is_variant
      from prompt_set_items i
      join prompts p on p.id = i.prompt_id
      where i.prompt_set_id = ${persona.set.id}
    `);
    expect(pItems.rows.every((r) => Boolean(r.is_variant))).toBe(true);
  });
});
