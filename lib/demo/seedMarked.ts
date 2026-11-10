import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { DEMO_ORG_NAME, DEMO_SEED_MARKER } from "@/lib/contracts";
import { CORRELATION_LABEL } from "@/lib/contracts/gaps";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { ROUTES } from "@/lib/capture/registry";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { fidelityFor, type Engine, type Runner } from "@/lib/capture/types";
import { canonicalizeCitationUrl } from "@/lib/citations/canonical";
import { deleteAllDataForOrg } from "@/lib/demo/deleteDemoOrgData";
import type { Db } from "@/lib/db/pg/client";
import { ensureContentTeamCampaigns } from "@/lib/contentTeam/seed";
import { IMPORT_TAG } from "@/lib/contentTeam/personas";
import {
  brands,
  campaigns,
  citations,
  citedPages,
  claims,
  competitorAliases,
  competitorDomains,
  competitors,
  costLedger,
  draws,
  judgeRuns,
  mentions,
  organizations,
  prompts,
  rawPayloads,
  recommendations,
  scans,
  strategyReports,
} from "@/lib/db/pg/schema";
import { seedDemoDemandSignals } from "@/lib/demand/demoSeedSignals";
import { freezePromptSet } from "@/lib/promptSets";

const DEMO_ORG_SLUG = "demo-university-leadership";

/** Canonical demo campaigns (names must match `CONTENT_TEAM_CAMPAIGNS`). */
const CAMPAIGN_ORDER = ["Energy", "AI", "Internships"] as const;

const PROMPTS_PER_CAMPAIGN = 30;
const DRAWS_PER_CELL = 3;

/** Primary measurement engines: 30 prompts × 3 draws × 6 engines = 540 draws per scan. */
const DEMO_ENGINES = ["chatgpt", "gemini", "perplexity", "claude", "google_aio", "google_ai_mode"] as const satisfies readonly Engine[];

/**
 * Fictional peers only — never real IPEDS institutions with invented numbers.
 * Kept in sync with `lib/demo/forbiddenRealInstitutions.ts` tests.
 */
export const DEMO_PEER_INSTITUTIONS = [
  { name: "Coastal State University", domain: "coastal-state.example.test", aliases: ["Coastal State University", "Coastal State"] as const },
  { name: "Piedmont Tech", domain: "piedmont-tech.example.test", aliases: ["Piedmont Tech", "Piedmont Technical University"] as const },
  { name: "Blue Ridge University", domain: "blueridge-u.example.test", aliases: ["Blue Ridge University", "Blue Ridge"] as const },
  { name: "Harbor College", domain: "harbor-college.example.test", aliases: ["Harbor College", "Harbor"] as const },
  { name: "Summit State", domain: "summit-state.example.test", aliases: ["Summit State", "Summit State University"] as const },
] as const;

type RouteInfo = { engine: Engine; runner: Runner; provider: string };

function routeForEngine(engine: Engine): RouteInfo {
  return ROUTES[engine].primary;
}

function demoHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function payloadSha(body: string, salt: string): string {
  const payloadBody = JSON.stringify({ body, salt, marker: DEMO_SEED_MARKER });
  return createHash("sha256").update(payloadBody).digest("hex");
}

async function insertRawPayload(db: Db, body: string, salt: string): Promise<string> {
  const sha256 = payloadSha(body, salt);
  await db
    .insert(rawPayloads)
    .values({
      sha256,
      content: body,
      bytes: Buffer.byteLength(body, "utf8"),
      storage: "inline",
      mediaType: "application/json",
      seedMarker: DEMO_SEED_MARKER,
    })
    .onConflictDoNothing();
  return sha256;
}

function answerFor(opts: {
  engine: Engine;
  promptIdx: number;
  drawIdx: number;
  mentionBrand: boolean;
  campaignName: string;
  scanOrdinal: 1 | 2;
  peerLines: string[];
}): string {
  const { engine, promptIdx, drawIdx, mentionBrand, campaignName, scanOrdinal, peerLines } = opts;
  const brand = mentionBrand ? "Demo University" : "several regional universities";
  const toneSeed = demoHash(`${engine}|${campaignName}|${scanOrdinal}|${promptIdx}|${drawIdx}`);
  const angle = ["overview", "comparison", "checklist", "timeline", "FAQ-style"][toneSeed % 5];
  const cite = mentionBrand
    ? "Official program pages on demo.example.test list credentials and contact points."
    : "Third-party summaries on peer.edu-review.test rarely list primary sources.";
  const peerBlock =
    peerLines.length > 0
      ? `Named peers in this answer include ${peerLines.join(" and ")}; rankings and ordering vary by source.`
      : "Peer comparisons use common public sources; ordering is not implied.";
  return [
    `In a typical ${angle} answer for this ${campaignName} question (${engine}), ${brand} is ${mentionBrand ? "often cited among regional options" : "not named among the leading options"}.`,
    `${mentionBrand ? "Demo University" : "Several regional universities"} appear in list-style responses; phrasing differs across answers.`,
    peerBlock,
    cite,
  ].join(" ");
}

/**
 * Varying mention rates by engine and campaign (deterministic). Not used for the dedicated McNemar signal engines.
 * `scanOrdinal` and stronger drawIdx weight reduce duplicate outcomes within the same prompt.
 */
function baseMentionBrand(
  engine: Engine,
  campaignName: string,
  promptIdx: number,
  drawIdx: number,
  scanOrdinal: 1 | 2,
): boolean {
  const engineBias = DEMO_ENGINES.indexOf(engine as (typeof DEMO_ENGINES)[number]);
  const campBias = campaignName === "Energy" ? 2 : campaignName === "AI" ? 5 : 3;
  const x = (promptIdx * 11 + drawIdx * 17 + engineBias * 13 + campBias * 3 + scanOrdinal * 5) % 17;
  return x < 10;
}

type McNemarSignal =
  | { engine: Engine; kind: "improvement_first_k"; k: number }
  | { engine: Engine; kind: "decline_first_k"; k: number };

const MCNEMAR_SIGNAL_BY_CAMPAIGN: Record<(typeof CAMPAIGN_ORDER)[number], McNemarSignal> = {
  Energy: { engine: "google_aio", kind: "improvement_first_k", k: 6 },
  AI: { engine: "chatgpt", kind: "decline_first_k", k: 6 },
  Internships: { engine: "perplexity", kind: "improvement_first_k", k: 6 },
};

function mentionBrandForDraw(opts: {
  campaignName: (typeof CAMPAIGN_ORDER)[number];
  engine: Engine;
  scanOrdinal: 1 | 2;
  promptIdx: number;
  drawIdx: number;
}): boolean {
  const signal = MCNEMAR_SIGNAL_BY_CAMPAIGN[opts.campaignName];
  if (signal && opts.engine === signal.engine) {
    if (signal.kind === "improvement_first_k") {
      if (opts.scanOrdinal === 1) return false;
      return opts.promptIdx < signal.k;
    }
    if (signal.kind === "decline_first_k") {
      if (opts.scanOrdinal === 1) return true;
      return opts.promptIdx >= signal.k;
    }
  }
  return baseMentionBrand(opts.engine, opts.campaignName, opts.promptIdx, opts.drawIdx, opts.scanOrdinal);
}

type SeededDemoPeer = { competitorId: string; domain: string; aliases: readonly [string, ...string[]] };

/**
 * Deterministic peer mentions: 1–2 competitors per draw, rotated by engine × campaign × prompt × draw × scan.
 */
function peerMentionsForDraw(
  peerRows: readonly SeededDemoPeer[],
  opts: {
    engine: Engine;
    campaignName: string;
    scanOrdinal: 1 | 2;
    promptIdx: number;
    drawIdx: number;
    mentionBrand: boolean;
  },
): Array<{ competitorId: string; domain: string; alias: string; line: string }> {
  if (peerRows.length === 0) return [];
  const h = demoHash(`${opts.engine}|${opts.campaignName}|${opts.scanOrdinal}|${opts.promptIdx}|${opts.drawIdx}|${opts.mentionBrand ? "1" : "0"}`);
  const nPeers = 1 + (h % 2);
  const engineBias = DEMO_ENGINES.indexOf(opts.engine as (typeof DEMO_ENGINES)[number]);
  const campBias = opts.campaignName === "Energy" ? 1 : opts.campaignName === "AI" ? 4 : 2;
  let start =
    (h + engineBias * 3 + campBias * 7 + opts.promptIdx * 2 + opts.drawIdx * 5 + opts.scanOrdinal) %
    peerRows.length;
  const out: Array<{ competitorId: string; domain: string; alias: string; line: string }> = [];
  for (let j = 0; j < nPeers; j++) {
    const row = peerRows[(start + j) % peerRows.length]!;
    const aliasPick = (h + j * 31 + engineBias) % row.aliases.length;
    const alias = row.aliases[aliasPick]!;
    out.push({
      competitorId: row.competitorId,
      domain: row.domain,
      alias,
      line: `${alias} is frequently referenced for program depth; see ${row.domain} for curriculum context.`,
    });
  }
  const seen = new Set<string>();
  return out.filter((m) => {
    if (seen.has(m.competitorId)) return false;
    seen.add(m.competitorId);
    return true;
  });
}

type CitationRow = { url: string; domain: string; sourceClass: "owned" | "gov" | "competitor" | "editorial"; position: number };

/**
 * Engine-skewed owned vs competitor citation mix so dashboards show different citation rates by engine.
 * McNemar signal engines keep a stable two-citation shape (only domain/class mix shifts slightly).
 */
function citationsForDraw(opts: {
  engine: Engine;
  campaignName: string;
  promptIdx: number;
  peerDomain: string;
  brandDomain: string;
  isMcNemarSignalEngine: boolean;
}): CitationRow[] {
  const { engine, campaignName, promptIdx, peerDomain, brandDomain, isMcNemarSignalEngine } = opts;
  const gov = { url: "https://example.gov/education/statistics", domain: "example.gov", sourceClass: "gov" as const, position: 2 };
  const ed = { url: "https://news.demo-review.test/higher-ed", domain: "news.demo-review.test", sourceClass: "editorial" as const, position: 2 };

  if (isMcNemarSignalEngine) {
    const flip = promptIdx % 2 === 0;
    if (flip) {
      return [
        { url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 1 },
        { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 2 },
      ];
    }
    return [
      { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 1 },
      { url: `https://${brandDomain}/news`, domain: brandDomain, sourceClass: "owned", position: 2 },
    ];
  }

  const rot = (demoHash(`${engine}|${campaignName}|${promptIdx}`) + DEMO_ENGINES.indexOf(engine as (typeof DEMO_ENGINES)[number])) % 6;
  switch (engine) {
    case "chatgpt":
      if (rot % 3 === 0) return [{ url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 1 }, gov];
      if (rot % 3 === 1) return [{ url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 1 }, ed];
      return [
        { url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 1 },
        { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 2 },
        gov,
      ];
    case "gemini":
      if (rot % 2 === 0)
        return [
          { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 1 },
          { url: `https://${brandDomain}/facts`, domain: brandDomain, sourceClass: "owned", position: 2 },
        ];
      return [{ url: `https://${peerDomain}/facts`, domain: peerDomain, sourceClass: "competitor", position: 1 }, gov];
    case "perplexity":
      return [
        { url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 1 },
        { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 2 },
        { url: `https://${peerDomain}/admissions`, domain: peerDomain, sourceClass: "competitor", position: 3 },
      ];
    case "claude":
      return [
        { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 1 },
        { url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 2 },
        ed,
      ];
    case "google_aio":
      if (rot % 2 === 0) return [{ url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 1 }, gov];
      return [
        { url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 1 },
        { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 2 },
      ];
    case "google_ai_mode":
      return [
        { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 1 },
        { url: `https://${brandDomain}/facts`, domain: brandDomain, sourceClass: "owned", position: 2 },
      ];
    default:
      return [
        { url: `https://${brandDomain}/programs/overview`, domain: brandDomain, sourceClass: "owned", position: 1 },
        { url: `https://${peerDomain}/programs`, domain: peerDomain, sourceClass: "competitor", position: 2 },
      ];
  }
}

/** Location-neutral question banks per campaign pillar (no brand, city, or "demo question N"). */
const PROMPT_BANKS: Record<(typeof CAMPAIGN_ORDER)[number], readonly string[]> = {
  AI: [
    "Which universities in the Southeast are known for AI research?",
    "Where can I study machine learning with strong industry partnerships?",
    "What schools offer undergraduate AI programs with research labs?",
    "Which universities publish open datasets for natural language processing?",
    "Who leads in responsible AI curriculum for undergraduates?",
    "What research universities partner with employers on AI internships?",
    "Which schools have AI ethics centers that undergraduates can join?",
    "Where do graduate students find applied AI projects with companies?",
    "What universities combine computer science and public policy on AI?",
    "Which Southeast universities host AI speaker series open to students?",
    "Who offers a master's focused on AI systems engineering?",
    "What schools are known for robotics and autonomous systems research?",
    "Which universities help startups with AI commercialization support?",
    "Where can a career switcher find an AI bootcamp affiliated with a university?",
    "What institutions rank highly for faculty citations in machine learning?",
    "Which universities run AI clinics that advise nonprofit organizations?",
    "Who offers dual degrees in AI and business analytics?",
    "What schools have GPU clusters available to graduate researchers?",
    "Which universities publish annual AI research impact reports?",
    "Where should a high school student look for AI summer research programs?",
    "What universities partner with hospitals on clinical AI tools?",
    "Which schools teach generative AI with clear academic integrity policies?",
    "Who has a strong track record placing AI PhDs into industry labs?",
    "What Southeast universities host hackathons focused on AI for good?",
    "Which universities offer micro-credentials in machine learning?",
    "Where can undergraduates join an AI research lab in their first year?",
    "What schools are known for speech and language technology research?",
    "Which universities collaborate on regional AI workforce alliances?",
    "Who offers evening master's courses in applied AI for working adults?",
    "What institutions publish open courseware for introductory AI?",
  ],
  Energy: [
    "Which universities in the Southeast are known for electric grid research?",
    "Where can I study energy systems with strong industry partnerships?",
    "What schools offer master's programs in renewable energy engineering?",
    "Which universities research battery storage and grid resilience?",
    "Who partners with utilities on clean energy workforce programs?",
    "What research universities host energy policy institutes?",
    "Which schools have living laboratories for microgrid experiments?",
    "Where do graduate students study offshore wind and coastal energy?",
    "What universities publish open data on regional energy demand?",
    "Which institutions train technicians for solar and storage installs?",
    "Who offers dual degrees in energy engineering and public policy?",
    "What schools research nuclear energy with strong safety curricula?",
    "Which universities help communities plan for energy transitions?",
    "Where can undergraduates join grid modernization research projects?",
    "What Southeast universities host energy innovation incubators?",
    "Which schools are known for power systems faculty and labs?",
    "Who partners with national labs on energy storage materials?",
    "What universities run extension programs on home energy efficiency?",
    "Which institutions offer certificates in energy data analytics?",
    "Where should policymakers look for university energy briefings?",
    "What schools research hydrogen and alternative fuels?",
    "Which universities host student competitions in energy design?",
    "Who offers a PhD track focused on electric vehicle infrastructure?",
    "What institutions publish annual clean energy outlook reports?",
    "Which universities collaborate with rural co-ops on grid upgrades?",
    "Where can career switchers find energy engineering master's options?",
    "What schools teach building science alongside energy systems?",
    "Which universities have strong industry advisory boards for energy?",
    "Who runs summer institutes on climate and energy for teachers?",
    "What Southeast universities are known for hydropower research?",
  ],
  Internships: [
    "Which universities help students find paid internships in technology?",
    "Where can undergraduates get co-op placements with regional employers?",
    "What schools have strong career services for engineering internships?",
    "Which universities partner with employers on summer research internships?",
    "Who offers academic credit for structured internship programs?",
    "What research universities place students in federal agency internships?",
    "Which schools are known for first-generation student internship support?",
    "Where can international students find CPT-friendly internship pathways?",
    "What universities run internship fairs focused on public service careers?",
    "Which institutions guarantee internship advising by the junior year?",
    "Who partners with startups on semester-long internship residencies?",
    "What schools help students find remote internships with mentoring?",
    "Which universities publish internship outcome and wage reports?",
    "Where do business students find consulting project internships?",
    "What Southeast universities place students in energy sector internships?",
    "Which schools offer scholarships that cover unpaid internship travel?",
    "Who has alumni networks that actively recruit interns each summer?",
    "What universities integrate internships into the AI curriculum?",
    "Which institutions help transfer students catch up on internship search?",
    "Where can graduate students find industry residencies related to research?",
    "What schools run employer-sponsored apprenticeship-style programs?",
    "Which universities host virtual internship prep workshops year-round?",
    "Who partners with hospitals on clinical and health-admin internships?",
    "What institutions place education majors in paid tutoring internships?",
    "Which universities help students find policy internships in state capitals?",
    "Where can arts students find museum and cultural internship placements?",
    "What schools are known for engineering co-op completion rates?",
    "Which universities offer micro-internships during winter term?",
    "Who provides emergency funding when internships require relocation?",
    "What Southeast universities track internship-to-full-time conversion?",
  ],
};

function promptTextFor(campaignName: (typeof CAMPAIGN_ORDER)[number], _pillar: string, index: number): string {
  const bank = PROMPT_BANKS[campaignName];
  return bank[index % bank.length]!;
}

/**
 * Full leadership-review dataset for Demo University: campaigns, frozen sets, 2 complete scans per campaign,
 * 30×3×6 draws each, judges, citations, gap recommendations, strategy, ledger. Idempotent via `deleteAllDataForOrg`.
 */
export async function seedFullDemoOrg(db: Db): Promise<{ orgId: string; campaignIds: string[] }> {
  const [bySlug] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (bySlug) await deleteAllDataForOrg(db, bySlug.id);
  const dupName = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, DEMO_ORG_NAME));
  for (const row of dupName) {
    const [o] = await db.select({ isDemo: organizations.isDemo }).from(organizations).where(eq(organizations.id, row.id));
    if (o?.isDemo) await deleteAllDataForOrg(db, row.id);
  }

  const [org] = await db
    .insert(organizations)
    .values({ name: DEMO_ORG_NAME, slug: DEMO_ORG_SLUG, isDemo: true })
    .returning({ id: organizations.id });

  const [brand] = await db
    .insert(brands)
    .values({ orgId: org.id, name: "Demo University", rootDomain: "demo.example.test" })
    .returning({ id: brands.id });

  await ensureContentTeamCampaigns(db, org.id);
  await ensureCaptureProviders(db, org.id);

  const region = await ensureNamedRegion(db, CHARLOTTE_REGION);
  const regionId = region.id;

  const campaignIdByName: Record<string, string> = {};
  const rows = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(eq(campaigns.orgId, org.id));
  for (const r of rows) campaignIdByName[r.name] = r.id;

  const seededPeers: SeededDemoPeer[] = [];
  for (let i = 0; i < DEMO_PEER_INSTITUTIONS.length; i++) {
    const peer = DEMO_PEER_INSTITUTIONS[i]!;
    const [compRow] = await db
      .insert(competitors)
      .values({ orgId: org.id, name: peer.name, source: "manual", sortOrder: i })
      .returning({ id: competitors.id });
    for (let a = 0; a < peer.aliases.length; a++) {
      await db.insert(competitorAliases).values({ competitorId: compRow.id, alias: peer.aliases[a]!, sortOrder: a });
    }
    await db.insert(competitorDomains).values({ competitorId: compRow.id, domain: peer.domain, sortOrder: 0 });
    seededPeers.push({ competitorId: compRow.id, domain: peer.domain, aliases: peer.aliases });
  }

  const allCampaignIds: string[] = [];

  for (const name of CAMPAIGN_ORDER) {
    const spec = { name, pillar: name === "AI" ? "AI" : name === "Energy" ? "Energy" : "Internships" };
    const campaignId = campaignIdByName[spec.name];
    if (!campaignId) throw new Error(`Demo seed: campaign ${spec.name} missing after ensureContentTeamCampaigns`);
    allCampaignIds.push(campaignId);

    // Pilot shape: 30 core (persona_id null) for budget/headline, plus the same 30 also usable as
    // location-neutral measured prompts. Optional persona voice lives in later content-team imports.
    const insertedPromptIds: string[] = [];
    for (let i = 0; i < PROMPTS_PER_CAMPAIGN; i++) {
      const text = promptTextFor(spec.name, spec.pillar, i);
      const [p] = await db
        .insert(prompts)
        .values({
          campaignId,
          text,
          personaId: null,
          branded: false,
          provenance: "synthesized",
          status: "approved",
          tags: [IMPORT_TAG, "demo_seed", `pillar:${spec.pillar}`, "estimate:series"],
        })
        .returning({ id: prompts.id });
      insertedPromptIds.push(p.id);
    }

    await seedDemoDemandSignals(db, campaignId, spec.pillar);

    const { set: frozenSet } = await freezePromptSet(db, org.id, campaignId);

    const scanLabels = ["Leadership complete scan 1", "Leadership complete scan 2"] as const;
    const scanMeta: Array<{ id: string; ordinal: 1 | 2 }> = [];

    for (let si = 0; si < scanLabels.length; si++) {
      const [scan] = await db
        .insert(scans)
        .values({
          campaignId,
          promptSetId: frozenSet.id,
          name: scanLabels[si],
          kind: "scan",
          status: "complete",
          approvedAt: new Date(),
        })
        .returning({ id: scans.id });
      scanMeta.push({ id: scan.id, ordinal: (si + 1) as 1 | 2 });

      for (let pIdx = 0; pIdx < insertedPromptIds.length; pIdx++) {
        const promptId = insertedPromptIds[pIdx];
        for (let drawIndex = 1; drawIndex <= DRAWS_PER_CELL; drawIndex++) {
          for (const engine of DEMO_ENGINES) {
            const route = routeForEngine(engine);
            const runner = route.runner;
            const searchUsed = runner === "api_search" ? true : null;
            const mentionBrand = mentionBrandForDraw({
              campaignName: spec.name as (typeof CAMPAIGN_ORDER)[number],
              engine,
              scanOrdinal: scanMeta[si].ordinal,
              promptIdx: pIdx,
              drawIdx: drawIndex,
            });
            const signal = MCNEMAR_SIGNAL_BY_CAMPAIGN[spec.name as (typeof CAMPAIGN_ORDER)[number]];
            const isMcNemarSignalEngine = Boolean(signal && engine === signal.engine);
            const peerMentions = peerMentionsForDraw(seededPeers, {
              engine,
              campaignName: spec.name,
              scanOrdinal: scanMeta[si].ordinal,
              promptIdx: pIdx,
              drawIdx: drawIndex,
              mentionBrand,
            });
            const primaryPeerDomain = peerMentions[0]?.domain ?? seededPeers[0]!.domain;
            const body = JSON.stringify({
              engine,
              runner,
              provider: route.provider,
              promptIndex: pIdx,
              drawIndex,
              scanOrdinal: scanMeta[si].ordinal,
              demo: true,
            });
            const rawPayloadId = await insertRawPayload(db, body, `${scan.id}-${promptId}-${engine}-${drawIndex}`);

            const answerText = answerFor({
              engine,
              promptIdx: pIdx,
              drawIdx: drawIndex,
              mentionBrand,
              campaignName: spec.name,
              scanOrdinal: scanMeta[si].ordinal,
              peerLines: peerMentions.map((m) => m.line),
            });
            const [drawRow] = await db
              .insert(draws)
              .values({
                scanId: scan.id,
                promptId,
                promptSetId: frozenSet.id,
                engine,
                runner,
                fidelity: fidelityFor(runner),
                provider: route.provider,
                modelBuild: "demo-seed-unknown",
                regionId,
                drawIndex,
                status: "ok",
                answerText,
                rawPayloadId,
                capturedAt: new Date(),
                searchUsed,
                seedMarker: DEMO_SEED_MARKER,
                costUnits: "1",
                costUsd: "0.01",
              })
              .returning({ id: draws.id });

            const domains = citationsForDraw({
              engine,
              campaignName: spec.name,
              promptIdx: pIdx,
              peerDomain: primaryPeerDomain,
              brandDomain: "demo.example.test",
              isMcNemarSignalEngine,
            });
            for (const c of domains) {
              const canonical = canonicalizeCitationUrl(c.url) ?? c.url;
              const pageTitle =
                c.sourceClass === "owned"
                  ? `Demo University ${spec.pillar} programs overview`
                  : c.sourceClass === "competitor"
                    ? `${c.domain.split(".")[0]} ${spec.pillar} curriculum guide`
                    : `Higher-ed roundup: ${spec.pillar} in the Southeast`;
              const h1 = pageTitle;
              const h2s =
                c.sourceClass === "owned"
                  ? [`Outcomes for ${spec.pillar}`, "FAQ for applicants"]
                  : [`How ${spec.pillar} programs compare`, "Admissions checklist"];
              await db
                .insert(citedPages)
                .values({
                  canonicalUrl: canonical,
                  fetchedAt: new Date(),
                  statusCode: 200,
                  title: pageTitle,
                  h1,
                  h2s,
                  publishedAt: new Date("2025-09-01T00:00:00Z"),
                  updatedAt: new Date("2026-01-15T00:00:00Z"),
                  wordCount: 800,
                  contentType: c.sourceClass === "owned" ? "program_page" : c.sourceClass === "gov" ? "government_data" : "ranking_list",
                  fetchStatus: "fetched",
                  seedMarker: DEMO_SEED_MARKER,
                  structuredFeatures: {
                    listicle: { present: c.sourceClass !== "owned", itemCount: c.sourceClass === "owned" ? 0 : 8 },
                    answerCapsule: { present: false, nearCapsule: false, question: null, answer: null, wordCount: 0 },
                    statisticsCount: c.sourceClass === "gov" ? 4 : 1,
                    namedQuotes: c.sourceClass === "editorial" ? [{ name: "Dean", quote: "Regional option." }] : [],
                  },
                })
                .onConflictDoNothing();
              await db.insert(citations).values({
                drawId: drawRow.id,
                url: c.url,
                canonicalUrl: canonical,
                domain: c.domain,
                position: c.position,
                linked: true,
                sourceClass: c.sourceClass,
                title: pageTitle,
              });
            }

            const brandSpanStart = mentionBrand ? answerText.indexOf("Demo University") : -1;
            const brandSpanEnd = brandSpanStart >= 0 ? brandSpanStart + "Demo University".length : 0;
            const firstPeerAlias = peerMentions[0]?.alias;
            const peerSpanStart = firstPeerAlias ? answerText.indexOf(firstPeerAlias) : -1;
            const peerSpanEnd = peerSpanStart >= 0 && firstPeerAlias ? peerSpanStart + firstPeerAlias.length : 0;
            const sentimentSpanStart =
              mentionBrand && brandSpanStart >= 0 ? brandSpanStart : peerSpanStart >= 0 ? peerSpanStart : null;
            const sentimentSpanEnd =
              mentionBrand && brandSpanStart >= 0 ? brandSpanEnd : peerSpanStart >= 0 ? peerSpanEnd : null;
            const [judgeRow] = await db
              .insert(judgeRuns)
              .values({
                drawId: drawRow.id,
                judgeModel: "demo_seed_judge",
                judgePromptVersion: "v2-demo",
                rawOutput: JSON.stringify({ demo: true, engine }),
                parsed: {
                  demo: true,
                  brandPresent: mentionBrand,
                  peersNamed: peerMentions.map((m) => m.alias),
                },
                sentiment: mentionBrand ? "positive" : peerMentions.length ? "neutral" : "none",
                sentimentSpanStart,
                sentimentSpanEnd,
              })
              .returning({ id: judgeRuns.id });

            // Ranked list positions (1-indexed) so Position metrics show values.
            const listOrder: Array<{ entityType: "brand" | "competitor"; entityId: string; alias: string }> = [];
            if (mentionBrand) listOrder.push({ entityType: "brand", entityId: brand.id, alias: "Demo University" });
            for (const m of peerMentions) listOrder.push({ entityType: "competitor", entityId: m.competitorId, alias: m.alias });
            // Rotate starting rank by draw so brand is not always #1 when present.
            const rotate = (pIdx + drawIndex) % Math.max(1, listOrder.length);
            const ranked = [...listOrder.slice(rotate), ...listOrder.slice(0, rotate)];

            if (mentionBrand && brandSpanStart >= 0) {
              const listPosition = ranked.findIndex((r) => r.entityType === "brand") + 1;
              await db.insert(mentions).values({
                judgeRunId: judgeRow.id,
                entityType: "brand",
                entityId: brand.id,
                aliasMatched: "Demo University",
                spanStart: brandSpanStart,
                spanEnd: brandSpanEnd,
                prominence: "first_paragraph",
                listPosition: listPosition > 0 ? listPosition : 1,
              });
            }

            let searchFrom = 0;
            for (const m of peerMentions) {
              const pos = answerText.indexOf(m.alias, searchFrom);
              if (pos < 0) continue;
              searchFrom = pos + m.alias.length;
              const listPosition = ranked.findIndex((r) => r.entityType === "competitor" && r.entityId === m.competitorId) + 1;
              await db.insert(mentions).values({
                judgeRunId: judgeRow.id,
                entityType: "competitor",
                entityId: m.competitorId,
                aliasMatched: m.alias,
                spanStart: pos,
                spanEnd: pos + m.alias.length,
                prominence: "body",
                listPosition: listPosition > 0 ? listPosition : null,
              });
            }

            const claimText = `Published program facts for ${spec.name} align with the answer's description of outcomes and partnerships.`;
            const cStart = answerText.length;
            const cEnd = cStart + claimText.length;
            await db.insert(claims).values({
              judgeRunId: judgeRow.id,
              text: claimText,
              spanStart: cStart,
              spanEnd: cEnd,
              verdict: "supported",
            });

            await db.insert(costLedger).values({
              orgId: org.id,
              provider: route.provider,
              scanId: scan.id,
              drawId: drawRow.id,
              promptId,
              engine,
              units: "1",
              usd: "0.01",
              ok: true,
              cached: false,
              seedMarker: DEMO_SEED_MARKER,
            });
          }
        }
      }
    }

    const gapA = insertedPromptIds.slice(0, 4);
    const gapB = insertedPromptIds.slice(4, 9);
    await db.insert(recommendations).values([
      {
        campaignId,
        kind: "gap",
        leverType: "on_page",
        owner: "Web and Digital Communications",
        evidenceGrade: "B",
        status: "open",
        payload: {
          headlineTerms: [spec.pillar, "outcomes"],
          format: "program_page",
          suggestedAction: `Update the ${spec.pillar} program page with clearer outcomes and FAQs drawn from lost questions.`,
          sharedAmongCitedPages: "Thin or listicle-style summaries without primary curriculum links",
          sharedAmongCitedPagesN: 12,
          citedPagesShare: {
            label: CORRELATION_LABEL,
            n: 12,
            headlineTerms: [
              {
                term: spec.pillar,
                n: 9,
                headlines: [
                  `${spec.pillar} curriculum guide`,
                  `Higher-ed roundup: ${spec.pillar} in the Southeast`,
                ],
              },
              {
                term: "outcomes",
                n: 6,
                headlines: [`Outcomes for ${spec.pillar}`],
              },
            ],
            contentTypes: [
              { label: "ranking list", n: 7 },
              { label: "program page", n: 3 },
              { label: "government data", n: 2 },
            ],
            faqs: [
              { label: "What programs exist?", n: 5 },
              { label: "How do I apply?", n: 4 },
            ],
            freshness: { summary: "Most pages updated within the last 12 months", n: 10 },
            peers: [
              { label: "Harbor College", n: 4 },
              { label: "Piedmont Tech", n: 3 },
            ],
          },
          note: "Owned pages trail peer listicles on discovery-style questions.",
        },
        evidence: {
          rows: [
            { source: "cited_page_sample", detail: "Peer and editorial pages often cite national rankings without linking to program prerequisites.", url: "https://news.example.test/higher-ed-roundup" },
            { source: "cited_page_sample", detail: "Government statistics pages appear without a path back to the official program catalog.", url: "https://example.gov/education/statistics" },
            { source: "synthetic_demo", detail: "Leadership demo evidence row for UI review." },
          ],
        },
        targetPromptIds: gapA,
        baselineScanId: scanMeta[0].id,
        seedMarker: DEMO_SEED_MARKER,
      },
      {
        campaignId,
        kind: "gap",
        leverType: "truth_layer",
        owner: "Provost Office",
        evidenceGrade: "C",
        status: "open",
        payload: {
          headlineTerms: ["factsheet", spec.pillar, "compare"],
          format: "faq",
          suggestedAction: `Publish a short factsheet that answers comparison questions so assistants can cite primary sources.`,
          sharedAmongCitedPages: "FAQ-style questions repeated across lost prompts",
          sharedAmongCitedPagesN: gapB.length,
          citedPagesShare: {
            label: CORRELATION_LABEL,
            n: gapB.length,
            headlineTerms: [
              {
                term: "compare",
                n: 4,
                headlines: [`How ${spec.pillar} programs compare`],
              },
            ],
            contentTypes: [
              { label: "FAQ content", n: 3 },
              { label: "news article", n: 2 },
            ],
            faqs: [
              { label: "How does Demo University compare on cost?", n: 3 },
              { label: "Which schools offer evening options?", n: 2 },
            ],
            freshness: { summary: "Mixed ages; several pages older than 18 months", n: gapB.length },
            peers: [{ label: "Coastal State University", n: 3 }],
          },
          note: "Third-party pages outrank official answers on head-to-head comparisons.",
        },
        evidence: {
          rows: [
            { source: "demo_seed", detail: "Synthetic comparison gap for leadership UI, correlation not proven cause." },
            { source: "demo_seed", detail: "Add citations to program pages referenced in gap analysis." },
          ],
        },
        targetPromptIds: gapB,
        baselineScanId: scanMeta[0].id,
        seedMarker: DEMO_SEED_MARKER,
      },
    ]);

    if (spec.name === "Energy") {
      await db.insert(strategyReports).values({
        campaignId,
        topic: "Demo leadership snapshot: AI, Energy, and Internships (cross-campaign)",
        inputs: { demo: true, pillars: [...CAMPAIGN_ORDER], promptCountPerCampaign: PROMPTS_PER_CAMPAIGN },
        output: {
          scoredItems: [
            {
              persona: "Undergraduate prospect",
              cluster: "multi-pillar visibility",
              format: "program page",
              headlineTerms: ["Demo University", "AI", "Energy", "Internships"],
              faqs: ["What programs exist?", "How do I apply?"],
              owner: "Enrollment Marketing",
              publishBy: null,
              score: 72,
              evidenceIds: [],
            },
          ],
          unscoredItems: [],
          offsite: [],
        },
        seedMarker: DEMO_SEED_MARKER,
      });
    }
  }

  return { orgId: org.id, campaignIds: allCampaignIds };
}

/**
 * Minimal demo-marked org for isolation tests (forbidden markers only under Demo org).
 * Delegates to {@link seedFullDemoOrg} so counts stay positive for all marker tables.
 */
export async function seedMarkedDemoOrg(db: Db): Promise<{ orgId: string; campaignId: string }> {
  const { orgId, campaignIds } = await seedFullDemoOrg(db);
  return { orgId, campaignId: campaignIds[0] };
}
