import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { getDb } from "@/lib/db/pg/client";
import { importBotLog, type LogFormat } from "@/lib/site/botlog";
import { siteContext } from "@/lib/site/context";
import { siteErrors } from "@/lib/site/http";
import { botHitsView } from "@/lib/site/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export const GET = withRole<{ id: string }>("viewer", async (_req, { user, params }) =>
  siteErrors(async () => NextResponse.json(await botHitsView(getDb(), user.orgId, params.id))),
);

/**
 * Multipart upload: file, format (auto | common | combined | cloudflare_json), default_host.
 * The file is hashed and parsed in this process; only AI bot rows are stored and no IP is kept.
 */
export const POST = withRole<{ id: string }>("editor", async (req, { user, params }) =>
  siteErrors(async () => {
    const db = getDb();
    await siteContext(db, params.id, user.orgId);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !file || typeof file === "string") return NextResponse.json({ error: "Attach a log file as `file`." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files over 200 MB are not accepted. Split the log first." }, { status: 413 });
    const format = String(form.get("format") || "auto");
    if (!["auto", "common", "combined", "cloudflare_json"].includes(format)) return NextResponse.json({ error: "Unknown format." }, { status: 400 });
    const summary = await importBotLog(db, {
      siteId: params.id,
      content: Buffer.from(await file.arrayBuffer()),
      fileName: file.name || null,
      format: format as LogFormat | "auto",
      defaultHost: (form.get("default_host") as string | null) || null,
      userId: user.userId,
    });
    return NextResponse.json({ import: summary }, { status: summary.already_imported ? 200 : 201 });
  }),
);
