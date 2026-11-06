import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { DEMO_ORG_NAME, DEMO_SEED_MARKER } from "@/lib/contracts";
import { ensureCaptureProviders } from "@/lib/capture/accounts";
import { ROUTES } from "@/lib/capture/registry";
import { CHARLOTTE_REGION, ensureNamedRegion } from "@/lib/capture/regions";
import { fidelityFor, type Engine, type Runner } from "@/lib/capture/types";
import { deleteAllDataForOrg } from "@/lib/demo/deleteDemoOrgData";
import type { Db } from "@/lib/db/pg/client";
import { ensureContentTeamCampaigns } from "@/lib/contentTeam/seed";
import { IMPORT_TAG } from "@/lib/contentTeam/personas";
import {
  brands,
  campaigns,
  citations,
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
import { freezePromptSet } from "@/lib/promptSets";

const DEMO_ORG_SLUG = "demo-university-leadership";

const CAMPAIGN_SEED_SPECS = [
  {
    name: "Energy",
    pillar: "Energy",
    prompts: [
      "Which universities near Charlotte have strong renewable energy research programs?",
      "How do North Carolina public universities compare on solar and grid research?",
      "What graduate pathways exist for someone interested in clean energy policy?",
      "Which schools partner with industry on battery and storage research?",
      "Where can I find faculty expertise on microgrids and distribution systems?",
      "What undergraduate tracks blend electrical engineering with sustainability?",
      "Which universities publish frequently on energy equity and community impact?",
      "How should I compare energy-related labs when shortlisting schools?",
      "What funding and fellowship options exist for energy-focused PhD students?",
      "Where can employers find energy research collaboration opportunities at a university?",
    ],
  },
  {
    name: "AI",
    pillar: "AI",
    prompts: [
      "Which universities offer applied AI programs that emphasize responsible use?",
      "How do I evaluate a university’s AI research strength versus peer schools?",
      "What should a prospective student ask about AI faculty and lab resources?",
      "Which public universities in the region highlight AI in healthcare applications?",
      "Where can I learn about industry partnerships around large language models?",
      "What undergraduate courses prepare students for AI engineering careers?",
      "How do universities disclose AI-related policies for students and researchers?",
      "Which schools combine AI with robotics or autonomous systems prominently?",
      "What signals show a university is investing in AI infrastructure long term?",
      "How do I find AI internship pipelines tied to a specific university?",
    ],
  },
  {
    name: "Internships",
    pillar: "Internships",
    prompts: [
      "Which universities have career services that place students in strong internships?",
      "How should I compare internship placement rates across similar universities?",
      "What questions reveal internship quality beyond a headline employer list?",
      "Which schools highlight co-op or internship requirements for certain majors?",
      "Where can employers post internships that reach university talent pipelines?",
      "How do regional universities connect students to Charlotte-area internships?",
      "What signals show sustained employer relationships versus one-off postings?",
      "Which universities help international students navigate internship eligibility?",
      "How do I interpret internship outcomes published by a university?",
      "What resources help a student turn an internship into a full-time offer?",
    ],
  },
] as const;

type RouteInfo = { engine: Engine; runner: Runner; provider: string };

function routeForEngine(engine: Engine): RouteInfo {
  return ROUTES[engine].primary;
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

function answerFor(engine: Engine, promptIdx: number, drawIdx: number, mentionBrand: boolean): string {
  const brand = mentionBrand ? "Demo University" : "several regional universities";
  const cite = mentionBrand
    ? "Official program pages on demo.example.test list credentials and contact points."
    : "Third-party summaries on example.edu-review.test rarely list primary sources.";
  return [
    `For this query (${engine}, draw ${drawIdx}), ${brand} is ${mentionBrand ? "often cited" : "not mentioned"} in typical assistant answers.`,
    `${mentionBrand ? "Demo University" : "Peer schools"} appear in list-style responses alongside national references.`,
    cite,
    `Prompt context #${promptIdx + 1}; synthetic demo narrative for leadership review only.`,
  ].join(" ");
}

/**
 * Full leadership-review dataset for Demo University: campaigns, frozen sets, scans, draws (all ROUTES engines), judges, recs, strategy, ledger.
 * Idempotent: removes prior demo org data for slug `demo-university-leadership` or name ${DEMO_ORG_NAME} with is_demo before insert.
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
  const rows = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(eq(campaigns.orgId, org.id));
  for (const r of rows) campaignIdByName[r.name] = r.id;

  const allCampaignIds: string[] = [];

  const engines = Object.keys(ROUTES) as Engine[];

  for (const spec of CAMPAIGN_SEED_SPECS) {
    const campaignId = campaignIdByName[spec.name];
    if (!campaignId) throw new Error(`Demo seed: campaign ${spec.name} missing after ensureContentTeamCampaigns`);
    allCampaignIds.push(campaignId);

    const insertedPromptIds: string[] = [];
    for (let i = 0; i < spec.prompts.length; i++) {
      const text = spec.prompts[i];
      const [p] = await db
        .insert(prompts)
        .values({
          campaignId,
          text,
          provenance: "synthesized",
          status: "approved",
          tags: [IMPORT_TAG, "demo_seed", `pillar:${spec.pillar}`, "estimate:series"],
        })
        .returning({ id: prompts.id });
      insertedPromptIds.push(p.id);
    }

    const { set: frozenSet } = await freezePromptSet(db, org.id, campaignId);

    const scanLabels = ["Demo leadership scan A", "Demo leadership scan B"] as const;
    for (const scanName of scanLabels) {
      const [scan] = await db
        .insert(scans)
        .values({
          campaignId,
          promptSetId: frozenSet.id,
          name: scanName,
          kind: "scan",
          status: "complete",
          approvedAt: new Date(),
        })
        .returning({ id: scans.id });

      for (let pIdx = 0; pIdx < insertedPromptIds.length; pIdx++) {
        const promptId = insertedPromptIds[pIdx];
        const drawIndex = 1;
        for (let ei = 0; ei < engines.length; ei++) {
          const engine = engines[ei];
          const route = routeForEngine(engine);
          const runner = route.runner;
          const searchUsed = runner === "api_search" ? true : null;
          const mentionBrand = (pIdx + ei) % 4 !== 3;
          const body = JSON.stringify({
            engine,
            runner,
            provider: route.provider,
            promptIndex: pIdx,
            drawIndex,
            demo: true,
          });
          const rawPayloadId = await insertRawPayload(db, body, `${scan.id}-${promptId}-${engine}-${drawIndex}`);

          const answerText = answerFor(engine, pIdx, drawIndex, mentionBrand);
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

          const domains =
            ei % 2 === 0
              ? [
                  { url: "https://demo.example.test/programs/overview", domain: "demo.example.test", sourceClass: "owned" as const, position: 1 },
                  { url: "https://example.gov/education/statistics", domain: "example.gov", sourceClass: "gov" as const, position: 2 },
                ]
              : [
                  { url: "https://peer-university.edu/ai", domain: "peer-university.edu", sourceClass: "competitor" as const, position: 1 },
                  { url: "https://news.example.test/charlotte-higher-ed-roundup", domain: "news.example.test", sourceClass: "editorial" as const, position: 2 },
                ];
          for (const c of domains) {
            await db.insert(citations).values({
              drawId: drawRow.id,
              url: c.url,
              domain: c.domain,
              position: c.position,
              linked: true,
              sourceClass: c.sourceClass,
              title: "Demo citation title",
            });
          }

          const spanStart = mentionBrand ? answerText.indexOf("Demo University") : 0;
          const spanEnd = mentionBrand ? spanStart + "Demo University".length : 0;
          const [judgeRow] = await db
            .insert(judgeRuns)
            .values({
              drawId: drawRow.id,
              judgeModel: "demo_seed_judge",
              judgePromptVersion: "v2-demo",
              rawOutput: JSON.stringify({ demo: true, engine }),
              parsed: { demo: true, brandPresent: mentionBrand },
              sentiment: mentionBrand ? "positive" : "neutral",
              sentimentSpanStart: mentionBrand ? spanStart : null,
              sentimentSpanEnd: mentionBrand ? spanEnd : null,
            })
            .returning({ id: judgeRuns.id });

          if (mentionBrand && spanStart >= 0) {
            await db.insert(mentions).values({
              judgeRunId: judgeRow.id,
              entityType: "brand",
              entityId: brand.id,
              aliasMatched: "Demo University",
              spanStart,
              spanEnd,
              prominence: "first_paragraph",
            });
          }

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

    const gapPrompts = insertedPromptIds.slice(0, 3);
    await db.insert(recommendations).values([
      {
        campaignId,
        kind: "gap",
        leverType: "on_page",
        owner: "Web & Digital Communications",
        evidenceGrade: "B",
        status: "open",
        payload: { headlineTerms: ["Demo University", spec.pillar], format: "program_page", note: "close SERP/listicle gap" },
        evidence: {
          rows: [
            { source: "demo_seed", detail: "Owned domain underrepresented vs peers on discovery prompts." },
            { source: "demo_seed", detail: "Synthetic evidence row for leadership UI." },
          ],
        },
        targetPromptIds: gapPrompts,
        seedMarker: DEMO_SEED_MARKER,
      },
      {
        campaignId,
        kind: "gap",
        leverType: "truth_layer",
        owner: "Provost Office",
        evidenceGrade: "C",
        status: "open",
        payload: { headlineTerms: ["factsheet", spec.pillar], format: "faq", note: "clarify comparisons" },
        evidence: { rows: [{ source: "demo_seed", detail: "Third-party pages outrank official program facts." }] },
        targetPromptIds: [insertedPromptIds[3], insertedPromptIds[4]],
        seedMarker: DEMO_SEED_MARKER,
      },
    ]);

    if (spec.name === "Energy") {
      await db.insert(strategyReports).values({
        campaignId,
        topic: "Demo leadership snapshot — AI, Energy, Internships (cross-campaign)",
        inputs: { demo: true, pillars: CAMPAIGN_SEED_SPECS.map((s) => s.pillar), promptCountPerCampaign: spec.prompts.length },
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
