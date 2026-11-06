import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/pg/client";
import { campaigns, prompts } from "@/lib/db/pg/schema";
import { createDataForSeoAdapter } from "@/lib/capture/adapters/dataforseo";
import { ROUTES } from "@/lib/capture/registry";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import type { Engine } from "@/lib/capture/types";
import { IMPORT_TAG } from "./personas";

export type SeriesEstimate = {
  campaign: string;
  campaignId: string;
  series: "core" | "persona";
  prompts: number;
  engines: number;
  drawsPerPrompt: number;
  totalDraws: number;
  usdEachUpper: number | null;
  usdTotalUpper: number | null;
  note: string;
};

const DRAWS = 3;
const ENGINES = Object.keys(ROUTES) as Engine[];

/**
 * Cost estimate only: 6 primary engines × 3 draws × Charlotte. Calls adapter.estimate (no network).
 * Does not create a scan or spend money.
 */
export async function estimateContentTeamSeries(db: Db, orgId: string): Promise<{
  series: SeriesEstimate[];
  coreDraws: number;
  personaDraws: number;
  coreUsd: number | null;
  personaUsd: number | null;
  totalUsd: number | null;
}> {
  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const adapter = createDataForSeoAdapter();
  let usdPerEngineSum: number | null = 0;
  for (const engine of ENGINES) {
    const route = ROUTES[engine].primary;
    const est = adapter.estimate({
      drawId: "estimate-only",
      engine: route.engine,
      runner: route.runner,
      prompt: "estimate",
      region,
      drawIndex: 1,
    });
    if (est.usd === null || usdPerEngineSum === null) usdPerEngineSum = null;
    else usdPerEngineSum += est.usd;
  }
  const perPromptUsd = usdPerEngineSum === null ? null : round4(usdPerEngineSum * DRAWS);

  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      neutrals: sql<number>`count(*) filter (where ${prompts.personaId} is null)::int`,
      variants: sql<number>`count(*) filter (where ${prompts.personaId} is not null)::int`,
    })
    .from(campaigns)
    .innerJoin(prompts, eq(prompts.campaignId, campaigns.id))
    .where(
      and(
        eq(campaigns.orgId, orgId),
        sql`coalesce((${campaigns.settings}->>'content_team_v1')::boolean, false) = true`,
        sql`${IMPORT_TAG} = any(${prompts.tags})`,
      ),
    )
    .groupBy(campaigns.id, campaigns.name);

  const series: SeriesEstimate[] = [];
  for (const r of rows) {
    for (const kind of ["core", "persona"] as const) {
      const n = kind === "core" ? Number(r.neutrals) : Number(r.variants);
      const totalDraws = n * ENGINES.length * DRAWS;
      series.push({
        campaign: r.name,
        campaignId: r.id,
        series: kind,
        prompts: n,
        engines: ENGINES.length,
        drawsPerPrompt: DRAWS,
        totalDraws,
        usdEachUpper: perPromptUsd,
        usdTotalUpper: perPromptUsd === null ? null : round4(perPromptUsd * n),
        note: "Upper-bound adapter estimates; Charlotte region; primary routes only. Not approved. Not run.",
      });
    }
  }

  const coreDraws = series.filter((s) => s.series === "core").reduce((a, s) => a + s.totalDraws, 0);
  const personaDraws = series.filter((s) => s.series === "persona").reduce((a, s) => a + s.totalDraws, 0);
  const coreUsd = sumUsd(series.filter((s) => s.series === "core"));
  const personaUsd = sumUsd(series.filter((s) => s.series === "persona"));
  const totalUsd = coreUsd === null || personaUsd === null ? null : round4(coreUsd + personaUsd);
  return { series, coreDraws, personaDraws, coreUsd, personaUsd, totalUsd };
}

function sumUsd(rows: SeriesEstimate[]): number | null {
  let t = 0;
  for (const r of rows) {
    if (r.usdTotalUpper === null) return null;
    t += r.usdTotalUpper;
  }
  return round4(t);
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
