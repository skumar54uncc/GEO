import fs from "fs";
import os from "os";
import path from "path";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LEGACY_PERSONA_MIGRATION } from "@/lib/contracts/personas";
import { EXPECTED_NEUTRAL, EXPECTED_VARIANTS, importContentTeamCsv } from "@/lib/contentTeam/import";
import { CONTENT_TEAM_PERSONAS, IMPORT_TAG } from "@/lib/contentTeam/personas";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { closeDb, getDb } from "@/lib/db/pg/client";
import { campaigns, personas, prompts } from "@/lib/db/pg/schema";
import {
  canonicalKeyForDbKey,
  CONTENT_TEAM_PERSONA_KEYS,
  EMPLOYER_LEGACY_ALIAS,
  PERSONA_LIBRARY,
  selectableDbKeyForCanonical,
} from "@/lib/personas/library";
import { ensureCanonicalPersonas } from "@/lib/personas/seed";
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

describe("Phase 4 persona library", () => {
  beforeAll(() => {
    writeSyntheticCsv();
  });

  afterAll(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  beforeEach(resetDatabase);

  it("lists 11 selectable personas and maps content-team duplicates explicitly", () => {
    expect(PERSONA_LIBRARY).toHaveLength(11);
    expect(PERSONA_LIBRARY.every((p) => p.selectable)).toBe(true);
    expect(EMPLOYER_LEGACY_ALIAS.selectable).toBe(false);
    expect(EMPLOYER_LEGACY_ALIAS.canonicalKey).toBe("employer");
    expect(selectableDbKeyForCanonical("employer")).toBe("business_partner");
    expect(canonicalKeyForDbKey("undergrad")).toBe("prospective_first_year");
    expect(canonicalKeyForDbKey("grad")).toBe("grad_applicant");
    expect(canonicalKeyForDbKey("research_partner")).toBe("research_partner");
    expect(canonicalKeyForDbKey("business_partner")).toBe("employer");
    expect(canonicalKeyForDbKey("business_leader")).toBe("employer");
    expect(
      Object.fromEntries(
        LEGACY_PERSONA_MIGRATION.map(({ legacyKey, canonicalKey }) => [legacyKey, canonicalKey]),
      ),
    ).toEqual({
      undergrad: "prospective_first_year",
      grad: "grad_applicant",
      research_partner: "research_partner",
      business_partner: "employer",
      business_leader: "employer",
    });
    for (const def of PERSONA_LIBRARY) {
      expect(def.goal.length).toBeGreaterThan(0);
      expect(def.background.length).toBeGreaterThan(0);
      expect(def.vocabulary.length).toBeGreaterThan(0);
      expect(def.region.length).toBeGreaterThan(0);
      expect(def.typicalQuestions.length).toBeGreaterThan(0);
    }
  });

  it("keeps the five content-team persona IDs stable across reseed and preserves 459 imported prompts", async () => {
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
    expect(selectable).toHaveLength(11);
    expect(second.find((p) => p.key === "business_leader")?.selectable).toBe(false);

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

    // Persona FKs for the five keys still resolve after library enrichment.
    for (const { key, id } of five) {
      const [row] = await db.select({ id: personas.id, key: personas.key }).from(personas).where(eq(personas.key, key));
      expect(row?.id).toBe(id);
      expect(CONTENT_TEAM_PERSONAS.some((p) => p.key === key)).toBe(true);
    }
  });
});
