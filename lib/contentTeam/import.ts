import fs from "fs";
import path from "path";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, personas, prompts } from "@/lib/db/pg/schema";
import { CONTENT_TEAM_CAMPAIGNS, IMPORT_TAG, PERSONA_MODE_PREFIX, type ContentTeamPersonaKey } from "./personas";
import { seedContentTeam } from "./seed";

export const EXPECTED_NEUTRAL = 118;
export const EXPECTED_VARIANTS = 341;

export type CsvRow = {
  prompt_id: string;
  pillar: string;
  question_id: string;
  region: string;
  branded: string;
  text: string;
  doc_personas: string;
  suggested_personas: string;
  note: string;
};

function splitList(raw: string): string[] {
  return String(raw ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error("CSV has no data rows");
  const header = splitCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = cols[idx] ?? "";
    });
    rows.push(obj as CsvRow);
  }
  return rows;
}

/** Minimal CSV splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export type ImportCounts = {
  neutral: number;
  variants: number;
  insertedNeutral: number;
  insertedVariants: number;
  perCampaign: Record<string, { neutral: number; variants: number }>;
};

export type ImportResult = ImportCounts & {
  csvPath: string;
  campaigns: Array<{ name: string; id: string }>;
};

function tagsFor(row: CsvRow): string[] {
  return [IMPORT_TAG, `pillar:${row.pillar}`, `qid:${row.question_id}`, `region:${row.region}`, `csv_id:${row.prompt_id}`];
}

function evidence(csvName: string) {
  return {
    source: "UComm content strategy draft v1",
    file: csvName,
    imported_at: new Date().toISOString(),
  };
}

/**
 * Import content-team CSV. Idempotent on (campaign_id, external_id).
 * Asserts 118 neutrals and 341 variants in the file; inserts only missing rows.
 */
export async function importContentTeamCsv(db: Db, orgId: string, csvPath: string): Promise<ImportResult> {
  const abs = path.resolve(csvPath);
  if (!fs.existsSync(abs)) throw new Error(`CSV not found: ${abs}`);
  const rows = parseCsv(abs);
  const csvName = path.basename(abs);

  let fileNeutral = 0;
  let fileVariants = 0;
  for (const row of rows) {
    fileNeutral++;
    fileVariants += splitList(row.suggested_personas).length;
  }
  if (fileNeutral !== EXPECTED_NEUTRAL || fileVariants !== EXPECTED_VARIANTS) {
    throw new Error(
      `CSV counts differ from expected: neutrals ${fileNeutral} (want ${EXPECTED_NEUTRAL}), variants ${fileVariants} (want ${EXPECTED_VARIANTS})`,
    );
  }

  const seeded = await seedContentTeam(db, orgId);
  const campaignByPillar = new Map<string, string>();
  for (const c of CONTENT_TEAM_CAMPAIGNS) {
    const found = seeded.campaigns.find((x) => x.name === c.name);
    if (!found) throw new Error(`Campaign ${c.name} missing after seed`);
    campaignByPillar.set(c.pillar, found.id);
  }
  const personaByKey = new Map(seeded.personas.map((p) => [p.key, p]));

  const perCampaign: ImportCounts["perCampaign"] = {};
  for (const c of CONTENT_TEAM_CAMPAIGNS) perCampaign[c.name] = { neutral: 0, variants: 0 };

  let insertedNeutral = 0;
  let insertedVariants = 0;
  const dem = evidence(csvName);

  for (const row of rows) {
    const campaignId = campaignByPillar.get(row.pillar);
    if (!campaignId) throw new Error(`Unknown pillar ${row.pillar} for ${row.prompt_id}`);
    const campaignName = CONTENT_TEAM_CAMPAIGNS.find((c) => c.pillar === row.pillar)!.name;
    const branded = String(row.branded).toLowerCase() === "true";
    const docPersonas = splitList(row.doc_personas);
    const suggested = splitList(row.suggested_personas);
    const note = row.note?.trim() ? row.note.trim() : null;
    const tagList = tagsFor(row);

    const neutralExt = row.prompt_id;
    const [existingNeutral] = await db
      .select({ id: prompts.id })
      .from(prompts)
      .where(and(eq(prompts.campaignId, campaignId), eq(prompts.externalId, neutralExt)));
    if (!existingNeutral) {
      await db.insert(prompts).values({
        campaignId,
        text: row.text,
        personaId: null,
        branded,
        provenance: "custom",
        demandEvidence: dem,
        status: "draft",
        tags: tagList,
        note,
        externalId: neutralExt,
        personaMode: null,
        docPersonas,
        suggestedPersonas: suggested,
      });
      insertedNeutral++;
    }
    perCampaign[campaignName].neutral++;

    for (const key of suggested) {
      const persona = personaByKey.get(key as ContentTeamPersonaKey);
      if (!persona) throw new Error(`Unknown persona key ${key} on ${row.prompt_id}`);
      const [pRow] = await db.select({ draftPrefix: personas.draftPrefix }).from(personas).where(eq(personas.id, persona.id));
      const prefix = pRow?.draftPrefix?.trim();
      if (!prefix) throw new Error(`Persona ${key} has no draft_prefix`);
      const variantText = `${prefix} ${row.text}`;
      const ext = `${row.prompt_id}:${key}`;
      const [existing] = await db
        .select({ id: prompts.id })
        .from(prompts)
        .where(and(eq(prompts.campaignId, campaignId), eq(prompts.externalId, ext)));
      if (!existing) {
        await db.insert(prompts).values({
          campaignId,
          text: variantText,
          personaId: persona.id,
          branded,
          provenance: "custom",
          demandEvidence: dem,
          status: "draft",
          tags: tagList,
          note,
          externalId: ext,
          personaMode: PERSONA_MODE_PREFIX,
          docPersonas,
          suggestedPersonas: suggested,
        });
        insertedVariants++;
      }
      perCampaign[campaignName].variants++;
    }
  }

  // Verify DB totals for this import tag across the three campaigns.
  const campaignIds = [...campaignByPillar.values()];
  const [{ nNeutral }] = await db
    .select({ nNeutral: sql<number>`count(*)::int` })
    .from(prompts)
    .where(
      and(
        inArray(prompts.campaignId, campaignIds),
        sql`${IMPORT_TAG} = any(${prompts.tags})`,
        sql`${prompts.personaId} is null`,
        sql`${prompts.externalId} is not null`,
        sql`${prompts.externalId} not like '%:%'`,
      ),
    );
  // Neutral external_ids never contain ":"; variants always do.
  const [{ nVariants }] = await db
    .select({ nVariants: sql<number>`count(*)::int` })
    .from(prompts)
    .where(
      and(
        inArray(prompts.campaignId, campaignIds),
        sql`${IMPORT_TAG} = any(${prompts.tags})`,
        sql`${prompts.personaId} is not null`,
      ),
    );

  if (Number(nNeutral) !== EXPECTED_NEUTRAL || Number(nVariants) !== EXPECTED_VARIANTS) {
    throw new Error(
      `After import, DB counts are neutrals=${nNeutral} variants=${nVariants}; expected ${EXPECTED_NEUTRAL} / ${EXPECTED_VARIANTS}`,
    );
  }

  return {
    csvPath: abs,
    campaigns: seeded.campaigns.map((c) => ({ name: c.name, id: c.id })),
    neutral: Number(nNeutral),
    variants: Number(nVariants),
    insertedNeutral,
    insertedVariants,
    perCampaign,
  };
}

/** Confirm a campaign is not the legacy Energy series. */
export async function assertNotLegacyCampaign(db: Db, campaignId: string): Promise<void> {
  const [c] = await db.select({ settings: campaigns.settings, name: campaigns.name }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) throw new Error("Campaign not found");
  if ((c.settings as { legacy?: boolean })?.legacy) {
    throw new Error(`Refusing to write to legacy campaign ${c.name}`);
  }
}
