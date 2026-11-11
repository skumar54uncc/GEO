import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as leadershipPdf } from "@/app/api/campaigns/[id]/leadership-pdf/route";
import { POST as analystNoteRoute } from "@/app/api/scans/[id]/analyst-note/route";
import { DEMO_DATA_BANNER } from "@/lib/contracts/exports";
import { getDb } from "@/lib/db/pg/client";
import { organizations, providerAccounts, users } from "@/lib/db/pg/schema";
import { leadershipPdfBytes, leadershipPdfHtml } from "@/lib/exports/leadershipPdf";
import { parseCampaignTarget, rollupCampaignDashboard } from "@/lib/metrics/rollup";
import { assertPublishedLength, setAnalystNote } from "@/lib/scans/analystNote";
import { eq } from "drizzle-orm";
import { addDraw, newScan, seed } from "../metrics/dbFixtures";
import { cookieFor, req, resetDatabase } from "../helpers";

describe("P1d baseline + target + analyst note + leadership PDF", () => {
  beforeEach(resetDatabase);

  it("marks the first scan of each prompt set as Baseline", async () => {
    const c = await seed(4);
    const s1 = await newScan(c, c.promptSetId, "complete", new Date("2026-01-01T00:00:00Z"));
    const s2 = await newScan(c, c.promptSetId, "complete", new Date("2026-02-01T00:00:00Z"));
    for (const scanId of [s1, s2]) {
      for (const pid of c.promptIds.slice(0, 2)) {
        await addDraw(c, scanId, pid, { brand: true, drawIndex: 1 });
        await addDraw(c, scanId, pid, { brand: true, drawIndex: 2 });
      }
    }
    const dash = await rollupCampaignDashboard(c.db, { orgId: c.orgId, campaignId: c.campaignId });
    const trend = dash.promptSets[0]!.trend;
    expect(trend.length).toBeGreaterThanOrEqual(2);
    expect(trend.find((t) => t.scanId === s1)?.isBaseline).toBe(true);
    expect(trend.find((t) => t.scanId === s2)?.isBaseline).toBe(false);
  });

  it("parses campaign targets and surfaces them on the dashboard", async () => {
    expect(parseCampaignTarget(null)).toBeNull();
    expect(
      parseCampaignTarget({ metric: "prompts_won", engine: "chatgpt", value: 0.55, date: "2026-12-01" }),
    ).toEqual({ metric: "prompts_won", engine: "chatgpt", value: 0.55, date: "2026-12-01" });

    const c = await seed(2);
    const { campaigns } = await import("@/lib/db/pg/schema");
    await c.db
      .update(campaigns)
      .set({ target: { metric: "prompts_won", engine: "chatgpt", value: 0.6, date: "2026-12-01" } })
      .where(eq(campaigns.id, c.campaignId));
    const s1 = await newScan(c);
    for (const pid of c.promptIds) {
      await addDraw(c, s1, pid, { brand: true, drawIndex: 1 });
      await addDraw(c, s1, pid, { brand: false, drawIndex: 2 });
    }
    const dash = await rollupCampaignDashboard(c.db, { orgId: c.orgId, campaignId: c.campaignId });
    expect(dash.target).toEqual({ metric: "prompts_won", engine: "chatgpt", value: 0.6, date: "2026-12-01" });
  });

  it("requires 3–5 sentences for published analyst notes; draft AI uses writer≠judge", async () => {
    expect(() => assertPublishedLength("One. Two.")).toThrow(/3 to 5/);
    expect(() => assertPublishedLength("One. Two. Three.")).not.toThrow();

    const c = await seed(2);
    const s1 = await newScan(c);
    const [author] = await c.db.insert(users).values({ email: `note-${Date.now()}@charlotte.edu` }).returning();
    await expect(
      setAnalystNote(c.db, {
        orgId: c.orgId,
        scanId: s1,
        authorId: author.id,
        text: "Too short.",
        status: "published",
      }),
    ).rejects.toThrow(/3 to 5/);

    const published = await setAnalystNote(c.db, {
      orgId: c.orgId,
      scanId: s1,
      authorId: author.id,
      text: "Visibility held steady on chat engines this month. Citation coverage still lags peers on owned domains. Share of voice improved slightly on ChatGPT. Next scan should confirm whether the content brief moved the needle.",
      status: "published",
    });
    expect(published.analystNoteStatus).toBe("published");

    await c.db.insert(providerAccounts).values({
      orgId: c.orgId,
      provider: "analyst_note_writer",
      perRunCapUnits: 5,
      creditsRemaining: 5,
      creditUnitUsd: null,
    });

    const prevKey = process.env.FIREWORKS_API_KEY;
    const prevContent = process.env.CONTENT_MODEL;
    const prevJudge = process.env.JUDGE_MODEL;
    try {
      process.env.FIREWORKS_API_KEY = "test";
      process.env.CONTENT_MODEL = "accounts/fireworks/models/writer-note";
      process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-note";
      const cookie = await cookieFor("editor-note@charlotte.edu", "editor");
      const chat = vi.fn(async () => ({
        ok: true,
        text: JSON.stringify({
          text: "Draft one. Draft two. Draft three. Draft four.",
        }),
        error: null,
      }));
      // Inject via module path by calling draft helper directly.
      const { draftAnalystNoteAi } = await import("@/lib/scans/analystNote");
      const draft = await draftAnalystNoteAi(c.db, {
        orgId: c.orgId,
        scanId: s1,
        authorId: author.id,
        headline: "ChatGPT prompts won 40% (n=20)",
        chat: chat as never,
      });
      expect(draft.analystNoteStatus).toBe("draft");
      const firstCall = (chat.mock.calls as unknown as Array<[{ model?: string }]>)[0]?.[0];
      expect(firstCall?.model).toBe("accounts/fireworks/models/writer-note");
      expect(firstCall?.model).not.toBe(process.env.JUDGE_MODEL);

      const save = await analystNoteRoute(
        req(`/api/scans/${s1}/analyst-note`, {
          method: "POST",
          cookie,
          body: {
            action: "save",
            text: "Edited one. Edited two. Edited three. Edited four.",
            status: "published",
          },
        }),
        { params: { id: s1 } },
      );
      expect(save.status).toBe(200);
    } finally {
      if (prevKey === undefined) delete process.env.FIREWORKS_API_KEY;
      else process.env.FIREWORKS_API_KEY = prevKey;
      if (prevContent === undefined) delete process.env.CONTENT_MODEL;
      else process.env.CONTENT_MODEL = prevContent;
      if (prevJudge === undefined) delete process.env.JUDGE_MODEL;
      else process.env.JUDGE_MODEL = prevJudge;
    }
  });

  it("leadership PDF is application/pdf with CI, Baseline, Target, analyst note, DEMO DATA watermark", async () => {
    const input = {
      organization: { name: "Demo University", isDemo: true },
      campaign: { name: "Energy", topic: "Energy" },
      headline: {
        engine: "chatgpt",
        runner: "ui_provider",
        won: 4,
        prompts: 10,
        rate: 0.4,
        ciLow: 0.2,
        ciHigh: 0.6,
        draws: 30,
      },
      trendLabel: "within noise",
      engines: [
        {
          engine: "chatgpt",
          runner: "ui_provider",
          won: 4,
          prompts: 10,
          rate: 0.4,
          ciLow: 0.2,
          ciHigh: 0.6,
          draws: 30,
        },
      ],
      analystNote: {
        text: "One. Two. Three. Four.",
        authorName: "Editor",
        at: "2026-11-01T00:00:00.000Z",
        status: "published" as const,
      },
      baselineDate: "2026-01-01",
      target: { metric: "prompts_won" as const, engine: "chatgpt", value: 0.55, date: "2026-12-01" },
      latestScan: { createdAt: "2026-01-01T00:00:00.000Z", isBaseline: true },
    };
    const html = leadershipPdfHtml(input);
    expect(html).toContain("Baseline");
    expect(html).toContain("Target");
    expect(html).toContain("20% to 60%");
    expect(html).toContain("Analyst note");
    expect(html).not.toContain("127.0.0.1");
    expect(html).not.toContain("localhost");

    const { extractPdfStrings } = await import("@/lib/exports/simplePdf");
    const bytes = leadershipPdfBytes(input);
    const asText = extractPdfStrings(bytes);
    expect(Buffer.from(bytes).subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(asText).toContain(DEMO_DATA_BANNER);
    expect(asText).toContain("Baseline");
    expect(asText).toContain("Target");
    expect(asText).toContain("20% to 60%");
    expect(asText).toContain("Analyst note");
    expect(asText).toContain("One. Two. Three. Four.");
    expect(asText).not.toMatch(/[´Ã�]/);
    expect(asText).not.toContain("127.0.0.1");
    expect(asText).not.toContain("localhost");
    expect(asText).not.toContain("prompts_won");
    expect(asText).not.toContain("ui_provider");
    const watermarkHits = asText.split(DEMO_DATA_BANNER).length - 1;
    expect(watermarkHits).toBeGreaterThanOrEqual(1);

    const c = await seed(2);
    await c.db.update(organizations).set({ isDemo: true, name: "Demo University" }).where(eq(organizations.id, c.orgId));
    const s1 = await newScan(c);
    for (const pid of c.promptIds) {
      await addDraw(c, s1, pid, { brand: true, drawIndex: 1 });
      await addDraw(c, s1, pid, { brand: true, drawIndex: 2 });
    }
    const cookie = await cookieFor("viewer-pdf@charlotte.edu", "viewer");
    const res = await leadershipPdf(
      req(`/api/campaigns/${c.campaignId}/leadership-pdf`, { method: "GET", cookie }),
      { params: { id: c.campaignId } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/pdf/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    const { extractPdfStrings: extract } = await import("@/lib/exports/simplePdf");
    expect(extract(buf)).toContain(DEMO_DATA_BANNER);
  });
});

