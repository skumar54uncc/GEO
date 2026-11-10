/**
 * Prompt library export for a frozen prompt set (P2 B9).
 * CSV and PDF share the same row contract.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { DEMO_DATA_BANNER } from "@/lib/contracts/exports";
import type { Db } from "@/lib/db/pg/client";
import {
  campaigns,
  organizations,
  personas,
  promptSetItems,
  promptSets,
  prompts,
  users,
} from "@/lib/db/pg/schema";
import { demandEvidenceLabel } from "@/lib/prompts/generate";
import { buildSimplePdf } from "@/lib/exports/simplePdf";

export type LibraryExportRow = {
  text: string;
  category: string;
  persona: string;
  intent: string;
  branded: boolean;
  provenance: string;
  demandEvidence: string;
  author: string;
  approvedBy: string;
  setHash: string;
  frozenDate: string;
};

export type LibraryExportPayload = {
  campaign: { id: string; name: string };
  promptSet: { id: string; version: number; sha256: string | null; frozenAt: string | null; label: string | null };
  organization: { name: string; isDemo: boolean };
  rows: LibraryExportRow[];
};

/** Category for export: explicit category, else intent, else untagged. */
export function categoryForExport(category: string | null | undefined, intent: string | null | undefined): string {
  const c = (category ?? "").trim();
  if (c) return c;
  const i = (intent ?? "").trim();
  if (i) return i;
  return "untagged";
}

export async function loadPromptLibraryExport(
  db: Db,
  opts: { orgId: string; campaignId: string; promptSetId: string },
): Promise<LibraryExportPayload | null> {
  const [set] = await db
    .select({
      id: promptSets.id,
      version: promptSets.version,
      sha256: promptSets.sha256,
      frozenAt: promptSets.frozenAt,
      label: promptSets.label,
      campaignId: promptSets.campaignId,
      campaignName: campaigns.name,
      orgId: campaigns.orgId,
      orgName: organizations.name,
      isDemo: organizations.isDemo,
    })
    .from(promptSets)
    .innerJoin(campaigns, eq(campaigns.id, promptSets.campaignId))
    .innerJoin(organizations, eq(organizations.id, campaigns.orgId))
    .where(
      and(
        eq(promptSets.id, opts.promptSetId),
        eq(promptSets.campaignId, opts.campaignId),
        eq(campaigns.orgId, opts.orgId),
      ),
    )
    .limit(1);
  if (!set) return null;

  const items = await db
    .select({
      textSnapshot: promptSetItems.promptTextSnapshot,
      text: prompts.text,
      category: prompts.category,
      intent: prompts.intent,
      branded: prompts.branded,
      provenance: prompts.provenance,
      demandEvidence: prompts.demandEvidence,
      personaName: personas.name,
      authorName: users.name,
      authorEmail: users.email,
      approvedById: prompts.approvedById,
    })
    .from(promptSetItems)
    .innerJoin(prompts, eq(prompts.id, promptSetItems.promptId))
    .leftJoin(personas, eq(personas.id, prompts.personaId))
    .leftJoin(users, eq(users.id, prompts.authorId))
    .where(eq(promptSetItems.promptSetId, opts.promptSetId))
    .orderBy(asc(promptSetItems.createdAt));

  const approverIds = [...new Set(items.map((i) => i.approvedById).filter((x): x is string => Boolean(x)))];
  const approverMap = new Map<string, string>();
  if (approverIds.length) {
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, approverIds));
    for (const u of rows) {
      approverMap.set(u.id, u.name?.trim() || u.email);
    }
  }

  const setHash = set.sha256 ?? "unknown";
  const frozenDate = set.frozenAt ? set.frozenAt.toISOString() : "unknown";

  const rows: LibraryExportRow[] = items.map((i) => ({
    text: i.textSnapshot || i.text,
    category: categoryForExport(i.category, i.intent),
    persona: i.personaName ?? "neutral",
    intent: i.intent ?? "untagged",
    branded: i.branded,
    provenance: i.provenance,
    demandEvidence: demandEvidenceLabel(i.demandEvidence),
    author: i.authorName?.trim() || i.authorEmail || "unknown",
    approvedBy: i.approvedById ? approverMap.get(i.approvedById) ?? "unknown" : "unknown",
    setHash,
    frozenDate,
  }));

  return {
    campaign: { id: set.campaignId, name: set.campaignName },
    promptSet: {
      id: set.id,
      version: set.version,
      sha256: set.sha256,
      frozenAt: set.frozenAt ? set.frozenAt.toISOString() : null,
      label: set.label,
    },
    organization: { name: set.orgName, isDemo: set.isDemo },
    rows,
  };
}

export function libraryExportToCsv(payload: LibraryExportPayload): string {
  const header = [
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
  ];
  const escape = (v: string) => {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [header.join(",")];
  if (payload.organization.isDemo) {
    lines.push(escape(`# ${DEMO_DATA_BANNER}`));
  }
  for (const r of payload.rows) {
    lines.push(
      [
        escape(r.text),
        escape(r.category),
        escape(r.persona),
        escape(r.intent),
        r.branded ? "true" : "false",
        escape(r.provenance),
        escape(r.demandEvidence),
        escape(r.author),
        escape(r.approvedBy),
        escape(r.setHash),
        escape(r.frozenDate),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function libraryExportToPdf(payload: LibraryExportPayload): Uint8Array {
  const headerLines = [
    `Prompt set v${payload.promptSet.version}${payload.promptSet.label ? ` (${payload.promptSet.label})` : ""}`,
    `Set hash: ${payload.promptSet.sha256 ?? "unknown"}`,
    `Frozen: ${payload.promptSet.frozenAt ?? "unknown"}`,
    `Rows: ${payload.rows.length}`,
  ];
  const blocks: Array<{ title?: string; lines: string[] }> = [
    { title: `Prompt library — ${payload.campaign.name}`, lines: headerLines },
  ];
  for (const r of payload.rows) {
    blocks.push({
      lines: [
        r.text,
        `category=${r.category} · persona=${r.persona} · intent=${r.intent} · branded=${r.branded ? "yes" : "no"}`,
        `provenance=${r.provenance} · demand=${r.demandEvidence}`,
        `author=${r.author} · approved_by=${r.approvedBy}`,
      ],
    });
  }
  return buildSimplePdf({
    blocks,
    watermark: payload.organization.isDemo ? DEMO_DATA_BANNER : null,
  });
}
