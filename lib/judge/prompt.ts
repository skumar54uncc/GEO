import type { AppConfig, JudgeJson } from "../types";

export const JUDGE_JSON_SCHEMA_EXAMPLE: JudgeJson = {
  brand_mentioned: true,
  brand_aliases_found: ["UNC Charlotte", "EPIC"],
  mention_rank: 3,
  total_entities_listed: 8,
  mention_prominence: "body",
  mention_sentiment: "positive",
  mention_context: "short quote of how the university was described",
  competitors: [{ name: "NC State", rank: 1, sentiment: "positive" }],
  citations: [{ domain: "charlotte.edu", is_target: true }],
  target_cited: true,
  subtopics_covered: ["grid_technology"],
  assets_surfaced: ["EPIC"],
  answer_summary: "one neutral sentence",
  hallucination_flags: ["any specific claim about UNC Charlotte that looks fabricated"],
};

export function buildJudgeSystemPrompt(config: AppConfig, opts: { citationsSeeded: boolean }): string {
  const aliases = config.aliases.map((a) => `- ${a}`).join("\n");
  const competitors = config.competitors
    .map((c) => `- ${c.name} (aliases: ${c.aliases.join(", ")}; domains: ${c.domains.join(", ")})`)
    .join("\n");
  const subtopics = config.subtopics.map((s) => `- ${s.id} (${s.label})`).join("\n");
  const assets = config.assets.map((a) => `- ${a.name}: ${a.description}`).join("\n");
  const targets = config.target_domains.join(", ");

  const citationRule = opts.citationsSeeded
    ? `Citations are already extracted from structured AI Overview references. Return "citations": [] and "target_cited": false; the pipeline will overwrite those two fields. Still analyze mention, rank, prominence, sentiment, competitors, assets, subtopics, and hallucinations.`
    : `Extract citations from any URLs or named sources in the answer. Reduce every URL to its registrable domain (e.g. epic.charlotte.edu → charlotte.edu). Set is_target true only for ${targets} and their subdomains. Set target_cited true if any citation is_target.`;

  return `You are an impartial measurement judge for university energy-brand visibility. Return JSON only. No markdown. No fences. No commentary.

DISAMBIGUATION RULE (mandatory):
The word "Charlotte" alone is the city and does NOT count as a brand mention.
A mention counts only when the text clearly refers to the institution UNC Charlotte / University of North Carolina at Charlotte, or a named unit such as EPIC or the Lee College of Engineering.
Do not treat Charlotte the city, Charlotte FC, or unrelated "Charlotte" uses as the university.

TARGET ALIASES (institution or named units):
${aliases}

CONFIGURED COMPETITORS (include only these, and only if actually present; never invent):
${competitors}

CONFIGURED SUBTOPIC TAGS (use only these ids in subtopics_covered):
${subtopics}

CONFIGURED ASSETS (list in assets_surfaced only if explicitly named):
${assets}

TARGET DOMAINS: ${targets}

FIELD RULES:
- brand_mentioned: true only if a target alias or named unit clearly refers to the institution.
- brand_aliases_found: the alias strings actually present.
- mention_rank: 1-indexed position of the first target mention in any ranked list of institutions/programs. If there is no ranked list, or the target is not in it, null.
- total_entities_listed: count of distinct institutions/programs in that list, else null.
- mention_prominence: exactly one of headline, first_paragraph, body, footnote_only, absent.
- mention_sentiment: positive, neutral, or negative. If brand_mentioned is false, use "neutral" and mention_prominence "absent".
- mention_context: a short quote of how the university was described, or empty string if absent.
- competitors: only configured competitors actually present. Each has name, rank (1-indexed in a list or null), sentiment (positive|neutral|negative).
- ${citationRule}
- subtopics_covered: only configured tag ids that the answer actually discusses.
- assets_surfaced: configured asset names explicitly named in the answer.
- answer_summary: one neutral sentence.
- hallucination_flags: specific claims about UNC Charlotte that look fabricated or unverifiable. Empty array if none.

Return exactly this shape:
${JSON.stringify(JUDGE_JSON_SCHEMA_EXAMPLE, null, 2)}`;
}

export function parseJudgeJson(raw: string): JudgeJson | null {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as JudgeJson;
      if (typeof parsed === "object" && parsed && "brand_mentioned" in parsed) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}
