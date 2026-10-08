import { contentModel, fireworksChat } from "./fireworks";
import { getStore } from "./db";
import { computeMetrics } from "./metrics";
import { loadDemandSnapshot, type DemandTermView } from "./demand";
import { AUDIENCE_LABELS, type AppConfig, type Audience, type FactRecord, type JudgeJson } from "./types";
import { FACT_BANK } from "@/seed/facts";
import { CAMPAIGN, YEAR_SLATE } from "@/seed/campaign";

export type ContentBrief = {
  prompt_id: number;
  prompt: string;
  audience: string;
  subtopic: string;
  diagnosis: "ranking" | "citation" | "both" | "visibility_gap";
  diagnosis_plain: string;
  who_is_winning: string[];
  demand: {
    term: string;
    us: number | null;
    nc: number | null;
    sc: number | null;
    rising: string[];
  } | null;
  page_to_create: string;
  h1: string;
  lead_fact: FactRecord;
  lead_paragraph: string;
  names_to_say: string[];
  outline: Array<{ heading: string; note: string }>;
  earned_media: string;
  also_publish: string[];
  schema_note: string;
  campaign_title?: string;
};

function parseJudge(raw: string): JudgeJson | null {
  try {
    const j = JSON.parse(raw) as JudgeJson;
    return typeof j.brand_mentioned === "boolean" ? j : null;
  } catch {
    return null;
  }
}

function pickFact(config: AppConfig, subtopics: string[]): FactRecord {
  const facts = config.facts && config.facts.length ? config.facts : FACT_BANK;
  const set = new Set(subtopics);
  const ranked = facts
    .map((f) => ({ f, n: f.subtopics.filter((s) => set.has(s)).length }))
    .sort((a, b) => b.n - a.n);
  return ranked[0]?.n ? ranked[0].f : facts[0] || FACT_BANK[0];
}

function templateParagraph(fact: FactRecord, prompt: string): string {
  const text = fact?.text || FACT_BANK[0].text;
  const url = fact?.source_url || FACT_BANK[0].source_url;
  return `${text} Use that sentence as the first paragraph of a page whose title is the question: “${prompt}” Do not bury the number. Link it to ${url}.`;
}

function winnersForPrompt(promptId: number): string[] {
  const store = getStore();
  const counts = new Map<string, number>();
  for (const r of store.listResponses({ prompt_id: promptId })) {
    const a = store.getAnalysisByResponse(r.id);
    if (!a || a.error_flag) continue;
    const j = parseJudge(a.judge_json);
    for (const c of j?.competitors ?? []) {
      counts.set(c.name, (counts.get(c.name) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, n]) => `${name} (${n} mentions)`);
}

function paaForPrompt(promptId: number): string[] {
  const org = getStore().getOrganic(promptId);
  if (!org) return [];
  try {
    const paa = JSON.parse(org.paa) as Array<{ question?: string }>;
    return paa.map((p) => p.question || "").filter(Boolean).slice(0, 5);
  } catch {
    return [];
  }
}

function demandForSubtopics(subtopics: string[]): DemandTermView | null {
  const snap = loadDemandSnapshot();
  return snap.terms.find((t) => subtopics.includes(t.subtopic) && snap.fetched) ?? null;
}

function diagnosisPlain(kind: ContentBrief["diagnosis"]): string {
  if (kind === "ranking") {
    return "charlotte.edu is not in Google’s top 10, so the AI Overview has little of yours to read. Fix the ranking page first.";
  }
  if (kind === "citation") {
    return "Models already know the name, but they are not citing charlotte.edu. Put a crawlable Q&A with a hard fact on a public URL, then repeat it in earned media.";
  }
  if (kind === "both") {
    return "You are missing from the Google top 10 and from the AI answer. This needs a ranking page and a citable fact, not a brochure rewrite.";
  }
  return "In this audience and topic, competitors appear and UNC Charlotte does not. Write the missing Q&A page for the exact question AI is already answering.";
}

export async function generateRecommendations(): Promise<{
  ok: boolean;
  briefs: ContentBrief[];
  campaign: typeof CAMPAIGN;
  used_model: boolean;
  error: string | null;
}> {
  const store = getStore();
  const config = store.getConfig();
  const metrics = computeMetrics();
  const briefs: ContentBrief[] = [];
  const seen = new Set<number>();

  const pushBrief = (opts: {
    prompt_id: number;
    prompt: string;
    audience: Audience | string;
    subtopic: string;
    diagnosis: ContentBrief["diagnosis"];
  }) => {
    if (seen.has(opts.prompt_id) && opts.prompt_id > 0) return;
    if (opts.prompt_id > 0) seen.add(opts.prompt_id);
    const promptRow = opts.prompt_id ? store.getPrompt(opts.prompt_id) : null;
    const subtopics = promptRow?.subtopics?.length ? promptRow.subtopics : [opts.subtopic];
    const fact = pickFact(config, subtopics);
    const demand = demandForSubtopics(subtopics);
    const paa = opts.prompt_id ? paaForPrompt(opts.prompt_id) : [];
    const outline =
      paa.length > 0
        ? paa.map((q) => ({ heading: q, note: "Answer in two sentences. Repeat the lead fact. Name EPIC." }))
        : [
            { heading: opts.prompt, note: "Open with the lead fact. Then one paragraph on who does the work." },
            { heading: "Who should a partner call?", note: "Name EPIC and the Lee College of Engineering." },
            { heading: "What is the proof?", note: "Link the NSF Engine / R1 source pages, not a JavaScript widget." },
          ];
    briefs.push({
      prompt_id: opts.prompt_id,
      prompt: opts.prompt,
      audience: AUDIENCE_LABELS[opts.audience as Audience] || String(opts.audience),
      subtopic: opts.subtopic,
      diagnosis: opts.diagnosis,
      diagnosis_plain: diagnosisPlain(opts.diagnosis),
      who_is_winning: opts.prompt_id ? winnersForPrompt(opts.prompt_id) : [],
      demand: demand
        ? {
            term: demand.term,
            us: demand.averages.US ?? null,
            nc: demand.averages["US-NC"] ?? null,
            sc: demand.averages["US-SC"] ?? null,
            rising: demand.rising.map((r) => r.query).filter(Boolean).slice(0, 5),
          }
        : null,
      page_to_create: `A public Q&A page whose H1 is the exact question. Not a generic energy hub.`,
      h1: opts.prompt,
      lead_fact: fact,
      lead_paragraph: templateParagraph(fact, opts.prompt),
      names_to_say: Array.from(new Set(["UNC Charlotte", "EPIC", "William States Lee College of Engineering", ...fact.names])),
      outline,
      earned_media: "Pitch the same opening fact to the Charlotte Business Journal, a utility partner channel, and an NSF/engine release so third-party pages exist for AI Overviews to cite.",
      also_publish: [
        "The same first paragraph on epic.charlotte.edu",
        "A news release that quotes the number in sentence one",
        "A faculty or center profile that repeats the number and links the .edu page",
      ],
      schema_note: "Add FAQ schema on a server-rendered HTML page. Do not hide the answer behind JavaScript-only rendering.",
    });
  };

  for (const row of metrics.organicVsAi) {
    if (!row.has_organic) continue;
    if (row.target_ranked && row.aio_mentioned) continue;
    const diagnosis: ContentBrief["diagnosis"] =
      !row.target_ranked && !row.aio_mentioned
        ? "ranking"
        : row.target_ranked && !row.aio_mentioned
          ? "citation"
          : "citation";
    if (!row.target_ranked && row.aio_mentioned) {
      pushBrief({
        prompt_id: row.prompt_id,
        prompt: row.text,
        audience: row.audience,
        subtopic: (store.getPrompt(row.prompt_id)?.subtopics[0] as string) || "grid_technology",
        diagnosis: "citation",
      });
      continue;
    }
    pushBrief({
      prompt_id: row.prompt_id,
      prompt: row.text,
      audience: row.audience,
      subtopic: (store.getPrompt(row.prompt_id)?.subtopics[0] as string) || "research_partnerships",
      diagnosis,
    });
  }

  for (const cell of metrics.gapMatrix.cells.filter((c) => c.flagged)) {
    const sample = store.listPrompts().find((p) => p.audience === cell.audience && p.subtopics.includes(cell.subtopic));
    if (!sample) continue;
    pushBrief({
      prompt_id: sample.id,
      prompt: sample.text,
      audience: cell.audience,
      subtopic: cell.subtopic,
      diagnosis: "visibility_gap",
    });
  }

  const covered = briefs.map((b) => b.h1.toLowerCase()).join(" ");
  YEAR_SLATE.forEach((piece, idx) => {
    const already =
      (piece.id === "who-leads-southeast" && covered.includes("southeast")) ||
      (piece.id === "duke-energy-partners" && covered.includes("duke energy"));
    if (already) {
      const hit = briefs.find((b) =>
        piece.id === "duke-energy-partners" ? b.h1.toLowerCase().includes("duke energy") : b.h1.toLowerCase().includes("southeast"),
      );
      if (hit) {
        hit.campaign_title = piece.title;
        hit.earned_media = piece.earned_media;
      }
      return;
    }
    const fact = (config.facts || FACT_BANK).find((f) => f.id === piece.lead_fact_id) || pickFact(config, piece.matches_subtopics);
    briefs.push({
      prompt_id: -1 - idx,
      prompt: piece.h1,
      audience: piece.audience,
      subtopic: piece.matches_subtopics[0],
      diagnosis: "visibility_gap",
      diagnosis_plain: piece.why,
      who_is_winning: [],
      demand: null,
      page_to_create: "A public Q&A page whose H1 is the exact question. Not a generic energy hub.",
      h1: piece.h1,
      lead_fact: fact,
      lead_paragraph: templateParagraph(fact, piece.h1),
      names_to_say: Array.from(new Set([...CAMPAIGN.names.slice(0, 6), ...fact.names])),
      outline: [
        { heading: piece.h1, note: "Open with the lead fact. Name UNC Charlotte, EPIC, and the Carolinas Grid Engine." },
        { heading: "Who is in the partnership?", note: "Duke Energy, Clemson, Dominion, Santee Cooper, both commerce departments." },
        { heading: "What happens next?", note: "Implementation phase; workforce, commercialization, reliability." },
      ],
      earned_media: piece.earned_media,
      also_publish: [
        "The same first paragraph on epic.charlotte.edu",
        "Syndicate the existing Robert Cox Q&A",
        "A faculty or center profile that repeats the $15M / $160M line",
      ],
      schema_note: "Add FAQ schema on a server-rendered HTML page. Do not hide the answer behind JavaScript-only rendering.",
      campaign_title: piece.title,
    });
  });

  let used_model = false;
  if (briefs.length && process.env.FIREWORKS_API_KEY) {
    const factList = (config.facts || []).map((f) => `- ${f.id}: ${f.text}`).join("\n");
    const result = await fireworksChat({
      model: contentModel(),
      json: true,
      system:
        "You write 40-word opening paragraphs for university energy pages. Use only facts supplied. Never invent numbers. Return JSON { paragraphs: [{ prompt_id, lead_paragraph }] }.",
      user: `FACTS (only these):\n${factList}\n\nBRIEFS:\n${JSON.stringify(briefs.map((b) => ({ prompt_id: b.prompt_id, prompt: b.prompt, fact_id: b.lead_fact.id })))}`,
    });
    if (result.ok) {
      try {
        const parsed = JSON.parse(result.text) as { paragraphs?: Array<{ prompt_id: number; lead_paragraph: string }> };
        for (const p of parsed.paragraphs ?? []) {
          const brief = briefs.find((b) => b.prompt_id === p.prompt_id);
          if (brief && p.lead_paragraph) brief.lead_paragraph = p.lead_paragraph;
        }
        used_model = true;
      } catch {
        used_model = false;
      }
    }
  }

  return {
    ok: true,
    briefs,
    campaign: CAMPAIGN,
    used_model,
    error: briefs.length ? null : "No gaps yet. Fetch Google AIO and run the judge first.",
  };
}
