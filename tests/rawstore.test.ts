import fs from "fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/pg/client";
import { rawPayloads } from "@/lib/db/pg/schema";
import { getRawText, INLINE_LIMIT_BYTES, putRaw, RawStoreIntegrityError, sha256, getRaw } from "@/lib/rawstore";
import { resetDatabase } from "./helpers";

describe("raw store", () => {
  beforeEach(resetDatabase);

  it("stores small payloads inline, addressed by sha256", async () => {
    const db = getDb();
    const hash = await putRaw(db, '{"a":1}', "application/json");
    expect(hash).toBe(sha256('{"a":1}'));
    const [row] = await db.select().from(rawPayloads).where(eq(rawPayloads.sha256, hash));
    expect(row.storage).toBe("inline");
    expect(await getRawText(db, hash)).toBe('{"a":1}');
  });

  it("dedupes identical content", async () => {
    const db = getDb();
    const a = await putRaw(db, "same text", "text/plain");
    const b = await putRaw(db, "same text", "text/plain");
    expect(a).toBe(b);
    const rows = await db.select().from(rawPayloads).where(eq(rawPayloads.sha256, a));
    expect(rows).toHaveLength(1);
  });

  it("writes payloads over the inline limit to a file", async () => {
    const db = getDb();
    const big = "x".repeat(INLINE_LIMIT_BYTES + 10);
    const hash = await putRaw(db, big, "text/html");
    const [row] = await db.select().from(rawPayloads).where(eq(rawPayloads.sha256, hash));
    expect(row.storage).toBe("file");
    expect(row.content).toBeNull();
    expect(fs.existsSync(row.path!)).toBe(true);
    expect(await getRawText(db, hash)).toBe(big);
  });

  it("refuses to return bytes that no longer match their hash", async () => {
    const db = getDb();
    const big = "y".repeat(INLINE_LIMIT_BYTES + 10);
    const hash = await putRaw(db, big, "text/html");
    const [row] = await db.select().from(rawPayloads).where(eq(rawPayloads.sha256, hash));
    fs.chmodSync(row.path!, 0o644);
    fs.writeFileSync(row.path!, "tampered");
    await expect(getRaw(db, hash)).rejects.toBeInstanceOf(RawStoreIntegrityError);
    fs.rmSync(row.path!);
  });
});
