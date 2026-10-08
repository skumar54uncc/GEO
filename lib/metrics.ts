import { getStore } from "./db";
import { formatRateLabel, wilsonInterval } from "./domain";
import type {
  AppConfig,
  Audience,
  JudgeJson,
  PromptRow,
  RateWithInterval,
  Surface,
} from "./types";
import { AUDIENCES, SURFACES } from "./types";

type Joined = {
  response_id: number;
  prompt: PromptRow;
  surface: Surface;
  run_number: number;
  location_note: string;
  captured_at: string;
  source_type: string;
  error_flag: boolean;
  manual_override: boolean;
  judge: JudgeJson | null;
};

function parseJudge(raw: string): JudgeJson | null {
  try {
    const j = JSON.parse(raw) as JudgeJson;
    if (typeof j.brand_mentioned !== "boolean") return null;
    return j;
  } catch {
    return null;
  }
}

function rate(successes: number, n: number): RateWithInterval {
  const w = wilsonInterval(successes, n);
  return {
    rate: w.rate,
    successes,
    n,
    ci_low: w.ci_low,
    ci_high: w.ci_high,
    label: formatRateLabel(successes, n, w.rate, w.ci_low, w.ci_high),
  };
}

export function computeMetrics() {
  const store = getStore();
  const config = store.getConfig();
  const prompts = store.listPrompts();
  const promptMap = new Map(prompts.map((p) => [p.id, p]));
  const responses = store.listResponses();
  const rows: Joined[] = [];
  for (const r of responses) {
    const prompt = promptMap.get(r.prompt_id);
    if (!prompt) continue;
    const analysis = store.getAnalysisByResponse(r.id);
    rows.push({
      response_id: r.id,
      prompt,
      surface: r.surface,
      run_number: r.run_number,
      location_note: r.location_note,
      captured_at: r.captured_at,
      source_type: r.source_type,
      error_flag: Boolean(analysis?.error_flag),
      manual_override: Boolean(analysis?.manual_override),
      judge: analysis && !analysis.error_flag ? parseJudge(analysis.judge_json) : null,
    });
  }
  const scored = rows.filter((r) => r.judge);
  const visibility = (subset: Joined[]) => {
    const ok = subset.filter((r) => r.judge);
    return rate(ok.filter((r) => r.judge!.brand_mentioned).length, ok.length);
  };

  const bySurface = SURFACES.map((surface) => ({
    surface,
    visibility: visibility(scored.filter((r) => r.surface === surface)),
    citation: (() => {
      const ok = scored.filter((r) => r.surface === surface && r.judge);
      return rate(ok.filter((r) => r.judge!.target_cited).length, ok.length);
    })(),
  }));

  const byPrompt = prompts.map((prompt) => {
    const subset = scored.filter((r) => r.prompt.id === prompt.id);
    return {
      prompt_id: prompt.id,
      text: prompt.text,
      audience: prompt.audience,
      subtopics: prompt.subtopics,
      visibility: visibility(subset),
      citation: rate(subset.filter((r) => r.judge!.target_cited).length, subset.length),
    };
  });

  const byAudience = AUDIENCES.map((audience) => ({
    audience,
    visibility: visibility(scored.filter((r) => r.prompt.audience === audience)),
  }));

  const bySubtopic = config.subtopics.map((sub) => ({
    subtopic: sub.id,
    label: sub.label,
    visibility: visibility(scored.filter((r) => r.prompt.subtopics.includes(sub.id))),
  }));

  const consistency = computeConsistency(rows);
  const sov = computeShareOfVoice(scored);
  const leaderboard = computeLeaderboard(scored, config);
  const citations = computeCitations(scored, config);
  const gapMatrix = computeGapMatrix(scored, config);
  const organicVsAi = computeOrganicVsAi(config);

  return {
    generated_at: new Date().toISOString(),
    backend: store.backend,
    overall: {
      visibility: visibility(scored),
      citation: rate(scored.filter((r) => r.judge!.target_cited).length, scored.length),
      analyzed_runs: scored.length,
      captured_runs: rows.length,
      judge_errors: rows.filter((r) => r.error_flag).length,
    },
    bySurface,
    byPrompt,
    byAudience,
    bySubtopic,
    consistency,
    shareOfVoice: sov,
    competitorLeaderboard: leaderboard,
    citations,
    gapMatrix,
    organicVsAi,
    caveats: [
      "Google AI Overview is location-pinned to United States. Manual chat surfaces use the location note captured on each save (typically Charlotte NC, incognito). Those caveats are not interchangeable.",
      "Every rate uses the count of successfully judged runs as its denominator. Empty paste boxes are not counted.",
      "Metrics are computed only from stored judge JSON. The judge is never re-called to aggregate.",
    ],
  };
}

function computeConsistency(rows: Joined[]) {
  const groups = new Map<string, Joined[]>();
  for (const r of rows) {
    const key = `${r.prompt.id}::${r.surface}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const buckets = { "3_of_3": 0, "2_of_3": 0, "1_of_3": 0, "0_of_3": 0, partial: 0 };
  const table: Array<{
    prompt_id: number;
    surface: Surface;
    mentioned: number;
    n: number;
    label: string;
  }> = [];
  for (const group of Array.from(groups.values())) {
    const judged = group.filter((g) => g.judge);
    if (!judged.length) continue;
    const mentioned = judged.filter((g) => g.judge!.brand_mentioned).length;
    const n = judged.length;
    const label = `${mentioned} of ${n}`;
    table.push({
      prompt_id: judged[0].prompt.id,
      surface: judged[0].surface,
      mentioned,
      n,
      label,
    });
    if (n === 3) {
      const key = `${mentioned}_of_3` as keyof typeof buckets;
      buckets[key] += 1;
    } else {
      buckets.partial += 1;
    }
  }
  return { buckets, table };
}

function computeShareOfVoice(scored: Joined[]) {
  let target = 0;
  let competitors = 0;
  for (const r of scored) {
    if (r.judge!.brand_mentioned) target += 1;
    competitors += r.judge!.competitors?.length ?? 0;
  }
  const denom = target + competitors;
  return {
    target_mentions: target,
    competitor_mentions: competitors,
    denominator: denom,
    share: denom === 0 ? null : target / denom,
    label:
      denom === 0
        ? "n = 0"
        : `${target} / (${target} + ${competitors}) = ${((target / denom) * 100).toFixed(1)}%`,
  };
}

function computeLeaderboard(scored: Joined[], config: AppConfig) {
  return config.competitors.map((c) => {
    const hits = scored.flatMap((r) => (r.judge!.competitors ?? []).filter((x) => x.name === c.name));
    const ranks = hits.map((h) => h.rank).filter((x): x is number => typeof x === "number");
    return {
      name: c.name,
      mention_count: hits.length,
      n_runs: scored.length,
      average_rank: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
      rank_n: ranks.length,
    };
  });
}

function computeCitations(scored: Joined[], config: AppConfig) {
  const counts = new Map<string, { count: number; is_target: boolean }>();
  let cited = 0;
  for (const r of scored) {
    if (r.judge!.target_cited) cited += 1;
    for (const c of r.judge!.citations ?? []) {
      const cur = counts.get(c.domain) ?? { count: 0, is_target: c.is_target };
      cur.count += 1;
      cur.is_target = cur.is_target || c.is_target;
      counts.set(c.domain, cur);
    }
  }
  const top = Array.from(counts.entries())
    .map(([domain, v]) => ({ domain, ...v }))
    .sort((a, b) => b.count - a.count);
  return {
    citation_rate: rate(cited, scored.length),
    top_domains: top,
    target_domains: config.target_domains,
  };
}

function computeGapMatrix(scored: Joined[], config: AppConfig) {
  const cells: Array<{
    audience: Audience;
    subtopic: string;
    target_mentions: number;
    competitor_mentions: number;
    n: number;
    flagged: boolean;
  }> = [];
  for (const audience of AUDIENCES) {
    for (const sub of config.subtopics) {
      const subset = scored.filter((r) => r.prompt.audience === audience && r.prompt.subtopics.includes(sub.id));
      const target_mentions = subset.filter((r) => r.judge!.brand_mentioned).length;
      const competitor_mentions = subset.reduce((acc, r) => acc + (r.judge!.competitors?.length ?? 0), 0);
      const flagged = subset.length > 0 && target_mentions === 0 && competitor_mentions > 0;
      cells.push({
        audience,
        subtopic: sub.id,
        target_mentions,
        competitor_mentions,
        n: subset.length,
        flagged,
      });
    }
  }
  return { subtopics: config.subtopics, cells };
}

function computeOrganicVsAi(config: AppConfig) {
  const store = getStore();
  const prompts = store.listPrompts();
  const organic = store.listOrganic();
  const byPrompt = new Map(organic.map((o) => [o.prompt_id, o]));
  return prompts
    .map((prompt) => {
      const org = byPrompt.get(prompt.id);
      const aioResponses = store.listResponses({ prompt_id: prompt.id, surface: "google_aio" });
      const aioAnalyses = aioResponses
        .map((r) => store.getAnalysisByResponse(r.id))
        .filter(Boolean);
      const aioJudge = aioAnalyses
        .map((a) => (a && !a.error_flag ? parseJudge(a.judge_json) : null))
        .filter(Boolean) as JudgeJson[];
      const aioMentioned = aioJudge.some((j) => j.brand_mentioned);
      const aioCited = aioJudge.some((j) => j.target_cited);
      const aioShown = org ? org.aio_shown : null;
      const competitorOrganic: string[] = org ? JSON.parse(org.competitor_domains) : [];
      const competitorAio = Array.from(
        new Set(aioJudge.flatMap((j) => (j.citations ?? []).filter((c) => !c.is_target).map((c) => c.domain))),
      );
      const both = competitorOrganic.filter((d) => competitorAio.includes(d));
      return {
        prompt_id: prompt.id,
        text: prompt.text,
        audience: prompt.audience,
        has_organic: Boolean(org),
        target_ranked: org ? Boolean(org.target_ranked) : null,
        target_position: org?.target_position ?? null,
        aio_shown: aioShown,
        aio_mentioned: aioJudge.length ? aioMentioned : null,
        aio_cited: aioJudge.length ? aioCited : null,
        competitor_organic: competitorOrganic,
        competitor_aio: competitorAio,
        competitor_both: both,
        finding:
          !org
            ? "organic not fetched"
            : org.target_ranked && aioMentioned
              ? "ranks organically and appears in AIO"
              : org.target_ranked && !aioMentioned
                ? "ranks organically but absent from AIO — citation problem"
                : !org.target_ranked && aioMentioned
                  ? "absent from organic top 10 but mentioned in AIO"
                  : "absent from organic top 10 and from AIO — ranking problem",
      };
    })
    .filter((row) => row.has_organic || row.aio_mentioned !== null);
}

export type Metrics = ReturnType<typeof computeMetrics>;
