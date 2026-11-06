import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPECTED_NEUTRAL, EXPECTED_VARIANTS, importContentTeamCsv } from "@/lib/contentTeam/import";
import { IMPORT_TAG } from "@/lib/contentTeam/personas";
import { seedContentTeam } from "@/lib/contentTeam/seed";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { campaigns, prompts } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";
import path from "path";

const CSV = path.resolve("inputs/content-team/content_team_prompts_v1.csv");

describe("content-team prompt import", () => {
  let orgId: string;

  beforeAll(async () => {
    const db = getDb();
    ({ orgId } = await legacyContext(db));
  });

  afterAll(async () => {
    await closeDb();
  });

  it("seeds personas and campaigns without touching legacy Energy", async () => {
    const db = getDb();
    const seeded = await seedContentTeam(db, orgId);
    expect(seeded.personas).toHaveLength(5);
    expect(seeded.campaigns.map((c) => c.name).sort()).toEqual(["AI", "Energy", "Internships"]);
    const legacy = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.orgId, orgId), eq(campaigns.name, "Energy"), sql`coalesce((${campaigns.settings}->>'legacy')::boolean, false) = true`));
    expect(legacy.length).toBeGreaterThanOrEqual(1);
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
