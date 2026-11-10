import fs from "fs";
import os from "os";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PERSONA_KEYS,
  LEGACY_PERSONA_MIGRATION,
  MENU_PERSONA_KEYS,
  MIN_PERSONA_DRAWS_FOR_DETAIL,
  PERSONA_GROUP_KEYS,
} from "@/lib/contracts/personas";
import { EXPECTED_NEUTRAL, EXPECTED_VARIANTS, importContentTeamCsv } from "@/lib/contentTeam/import";
import { CONTENT_TEAM_PERSONAS, IMPORT_TAG } from "@/lib/contentTeam/personas";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { campaigns, personas, prompts } from "@/lib/db/pg/schema";
import {
  assertBusinessPartnerAliasCombined,
  buildPersonaCellMeta,
  dashboardPersonaSlices,
} from "@/lib/metrics/personaCells";
import type { CellRollup } from "@/lib/metrics/rollup";
import {
  canonicalKeyForDbKey,
  CONTENT_TEAM_PERSONA_KEYS,
  groupForDbKey,
  menuPersonaDefinitions,
  PERSONA_LIBRARY,
  selectableDbKeyForCanonical,
} from "@/lib/personas/library";
import { assertLibraryOpeningsBrandSafe, openingContainsBrandOrAlias, TEST_BRAND_ALIASES } from "@/lib/personas/openings";
import { ensureCanonicalPersonas } from "@/lib/personas/seed";
import { assertFixturePackBrandSafe, buildBuiltinFixture, FIXTURE_INTENT_STEMS } from "@/lib/prompts/fixturePack";
import { resetDatabase } from "../helpers";

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-persona-phase4-"));
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
    const personaList =
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
      personaList,
      "",
    ].join(",");
  });
  fs.writeFileSync(CSV, [header, ...rows].join("\n"));
}

describe("Persona library (Christy taxonomy)", () => {
  beforeAll(() => {
    writeSyntheticCsv();
  });

  afterAll(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  beforeEach(resetDatabase);

  it("has 7 groups, 20 menu personas, and merges business into one canonical", () => {
    expect(PERSONA_GROUP_KEYS).toHaveLength(7);
    expect(MENU_PERSONA_KEYS).toHaveLength(20);
    expect(menuPersonaDefinitions()).toHaveLength(20);
    expect(CANONICAL_PERSONA_KEYS).toHaveLength(22);
    expect(PERSONA_LIBRARY.filter((p) => p.selectable)).toHaveLength(22);
    expect(PERSONA_LIBRARY.filter((p) => p.kind === "alias")).toHaveLength(1);
    expect(selectableDbKeyForCanonical("business_partner")).toBe("business_partner");
    expect(canonicalKeyForDbKey("business_partner")).toBe("business_partner");
    expect(canonicalKeyForDbKey("business_leader")).toBe("business_partner");
    expect(canonicalKeyForDbKey("undergrad")).toBe("undergrad");
    expect(canonicalKeyForDbKey("grad")).toBe("grad");
    expect(groupForDbKey("undergrad")).toBe("prospective_students");
    expect(groupForDbKey("grad")).toBe("prospective_students");
    expect(groupForDbKey("business_partner")).toBe("business_leaders_partners");
    expect(groupForDbKey("state_policymaker")).toBe("government_policy");
    expect(
      Object.fromEntries(
        LEGACY_PERSONA_MIGRATION.map(({ legacyKey, canonicalKey }) => [legacyKey, canonicalKey]),
      ),
    ).toEqual({
      undergrad: "undergrad",
      grad: "grad",
      research_partner: "research_partner",
      business_partner: "business_partner",
      business_leader: "business_partner",
    });
    assertLibraryOpeningsBrandSafe(TEST_BRAND_ALIASES);
  });

  it("fixture pack stems and openings stay brand-free (covers generated output openings)", () => {
    assertFixturePackBrandSafe(TEST_BRAND_ALIASES);
    expect(FIXTURE_INTENT_STEMS.discovery.length).toBeGreaterThan(0);
    // Generated texts concatenate openings + stems — both must already be brand-safe.
    const pack = buildBuiltinFixture({
      personas: [
        { id: "00000000-0000-4000-8000-000000000001", key: "a", opening: "I'm a high school senior in North Carolina choosing a college." },
        { id: "00000000-0000-4000-8000-000000000002", key: "b", opening: "I'm looking for a master's program." },
        { id: "00000000-0000-4000-8000-000000000003", key: "c", opening: "I'm an employer hiring early-career talent." },
      ],
      intents: ["discovery"],
    });
    for (const p of pack.prompts) {
      expect(openingContainsBrandOrAlias(p.text, TEST_BRAND_ALIASES)).toBe(false);
    }
  });

  it("keeps the five content-team persona IDs stable and preserves 459 imported prompts", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);

    const first = await ensureCanonicalPersonas(db);
    const five = CONTENT_TEAM_PERSONA_KEYS.map((key) => {
      const row = first.find((p) => p.key === key);
      expect(row, key).toBeTruthy();
      return { key, id: row!.id };
    });
    expect(five).toHaveLength(5);

    const second = await ensureCanonicalPersonas(db);
    for (const { key, id } of five) {
      expect(second.find((p) => p.key === key)?.id).toBe(id);
    }

    const selectable = second.filter((p) => p.selectable);
    expect(selectable).toHaveLength(22);
    const partner = second.find((p) => p.key === "business_partner");
    const leader = second.find((p) => p.key === "business_leader");
    expect(partner?.canonicalKey).toBe("business_partner");
    expect(leader?.canonicalKey).toBe("business_partner");
    expect(partner?.id).not.toBe(leader?.id);
    expect(leader?.selectable).toBe(false);

    const [partnerRow] = await db
      .select({ group: personas.personaGroup, draftPrefix: personas.draftPrefix })
      .from(personas)
      .where(eq(personas.key, "business_partner"));
    expect(partnerRow.group).toBe("business_leaders_partners");
    expect(partnerRow.draftPrefix).not.toMatch(/Charlotte|UNCC|UNC Charlotte/i);

    const imported = await importContentTeamCsv(db, orgId, CSV);
    expect(imported.neutral).toBe(EXPECTED_NEUTRAL);
    expect(imported.variants).toBe(EXPECTED_VARIANTS);
    expect(imported.neutral + imported.variants).toBe(459);

    const [countRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(prompts)
      .where(sql`${IMPORT_TAG} = any(${prompts.tags})`);
    expect(countRow.n).toBe(459);

    const contentCampaigns = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.orgId, orgId),
          sql`coalesce((${campaigns.settings}->>'content_team_v1')::boolean, false) = true`,
        ),
      );
    expect(contentCampaigns).toHaveLength(3);

    for (const { key, id } of five) {
      const [row] = await db.select({ id: personas.id, key: personas.key }).from(personas).where(eq(personas.key, key));
      expect(row?.id).toBe(id);
      expect(CONTENT_TEAM_PERSONAS.some((p) => p.key === key)).toBe(true);
    }

    const meta = buildPersonaCellMeta([
      { id: partner!.id, key: "business_partner" },
      { id: leader!.id, key: "business_leader" },
    ]);
    expect(meta.get(leader!.id)?.reportPersonaId).toBe(partner!.id);
    expect(meta.get(leader!.id)?.canonicalKey).toBe("business_partner");

    const cells = [
      {
        key: {
          engine: "chatgpt",
          runner: "ui_provider",
          index: "chat",
          regionId: null,
          personaId: partner!.id,
          personaGroup: null,
          branded: false,
        },
        draws: MIN_PERSONA_DRAWS_FOR_DETAIL,
      },
      {
        key: {
          engine: "chatgpt",
          runner: "ui_provider",
          index: "chat",
          regionId: null,
          personaId: null,
          personaGroup: "business_leaders_partners",
          branded: false,
        },
        draws: 10,
      },
      {
        key: {
          engine: "chatgpt",
          runner: "ui_provider",
          index: "chat",
          regionId: null,
          personaId: partner!.id,
          personaGroup: null,
          branded: false,
        },
        draws: 5,
      },
    ] as CellRollup[];
    expect(() => assertBusinessPartnerAliasCombined(cells, meta)).not.toThrow();
    const slices = dashboardPersonaSlices(cells);
    expect(slices.byGroup).toHaveLength(1);
    expect(slices.byPersona).toHaveLength(1);
    expect(slices.byPersona[0].draws).toBeGreaterThanOrEqual(MIN_PERSONA_DRAWS_FOR_DETAIL);
  });
});
