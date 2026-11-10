import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/pg/client";
import { campaigns, prompts, users } from "@/lib/db/pg/schema";
import { freezePromptSet } from "@/lib/promptSets";
import {
  categoryForExport,
  libraryExportToCsv,
  libraryExportToPdf,
  loadPromptLibraryExport,
} from "@/lib/prompts/libraryExport";
import { bulkSetStatus } from "@/lib/prompts/review";
import { legacyContext } from "@/lib/db/pg/bootstrap";
import { resetDatabase } from "../helpers";

describe("P2 B9 prompt library export", () => {
  it("categoryForExport prefers category, then intent, then untagged", () => {
    expect(categoryForExport("career", "discovery")).toBe("career");
    expect(categoryForExport(null, "discovery")).toBe("discovery");
    expect(categoryForExport("  ", null)).toBe("untagged");
  });

  it("CSV and PDF include required columns and rows for a frozen set", async () => {
    await resetDatabase();
    const db = getDb();
    const ctx = await legacyContext(db);
    const [campaign] = await db
      .insert(campaigns)
      .values({
        orgId: ctx.orgId,
        brandId: ctx.brandId,
        name: "B9 library export",
        topic: "Energy",
        status: "active",
      })
      .returning();
    const [author] = await db
      .insert(users)
      .values({ email: "b9-author@charlotte.edu", name: "B9 Author" })
      .returning();
    const [approver] = await db
      .insert(users)
      .values({ email: "b9-approver@charlotte.edu", name: "B9 Approver" })
      .returning();

    const [p] = await db
      .insert(prompts)
      .values({
        campaignId: campaign.id,
        text: "best energy graduate programs in North Carolina",
        provenance: "custom",
        status: "draft",
        branded: false,
        intent: "discovery",
        category: "energy",
        authorId: author.id,
        demandEvidence: { label: "no demand evidence", ids: [] },
      })
      .returning();

    await bulkSetStatus(db, ctx.orgId, campaign.id, [p.id], "approved", {
      approvedById: approver.id,
    });
    const { set } = await freezePromptSet(db, ctx.orgId, campaign.id);
    const payload = await loadPromptLibraryExport(db, {
      orgId: ctx.orgId,
      campaignId: campaign.id,
      promptSetId: set.id,
    });
    expect(payload).not.toBeNull();
    expect(payload!.rows).toHaveLength(1);
    expect(payload!.rows[0]).toMatchObject({
      text: "best energy graduate programs in North Carolina",
      category: "energy",
      intent: "discovery",
      branded: false,
      provenance: "custom",
      author: "B9 Author",
      approvedBy: "B9 Approver",
      setHash: set.sha256,
    });
    expect(payload!.rows[0]!.frozenDate).not.toBe("unknown");

    const csv = libraryExportToCsv(payload!);
    for (const col of [
      "text",
      "category",
      "persona",
      "intent",
      "branded",
      "provenance",
      "demand_evidence",
      "author",
      "approved_by",
      "set_hash",
      "frozen_date",
    ]) {
      expect(csv.split("\n")[0]).toContain(col);
    }
    expect(csv).toContain("best energy graduate programs in North Carolina");
    expect(csv).toContain("B9 Approver");

    const pdf = libraryExportToPdf(payload!);
    expect(Buffer.from(pdf.subarray(0, 5)).toString("utf8")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(200);

    const [updated] = await db.select().from(prompts).where(eq(prompts.id, p.id));
    expect(updated?.approvedById).toBe(approver.id);
  }, 90_000);
});
