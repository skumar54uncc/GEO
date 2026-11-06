import crypto from "crypto";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import type { Db } from "./db/pg/client";
import { rawPayloads } from "./db/pg/schema";

export const INLINE_LIMIT_BYTES = 256 * 1024;

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function rawStoreDir(): string {
  return path.resolve(process.env.RAW_STORE_DIR || path.join(process.cwd(), "data", "raw"));
}

export class RawStoreIntegrityError extends Error {}

/**
 * Content addressed, write once. Returns the sha256 of the bytes. Identical content is stored once.
 * Payloads over INLINE_LIMIT_BYTES are written to RAW_STORE_DIR/<sha256> and only the path is kept.
 */
export async function putRaw(db: Db, content: string | Buffer, mediaType: string): Promise<string> {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const hash = sha256(buf);
  const existing = await db.select({ sha: rawPayloads.sha256 }).from(rawPayloads).where(eq(rawPayloads.sha256, hash));
  if (existing.length) return hash;

  const isText = typeof content === "string";
  if (buf.byteLength > INLINE_LIMIT_BYTES || !isText) {
    const dir = rawStoreDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, hash);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, buf, { mode: 0o444 });
    }
    await db
      .insert(rawPayloads)
      .values({ sha256: hash, content: null, bytes: buf.byteLength, storage: "file", path: file, mediaType })
      .onConflictDoNothing();
  } else {
    await db
      .insert(rawPayloads)
      .values({ sha256: hash, content, bytes: buf.byteLength, storage: "inline", path: null, mediaType })
      .onConflictDoNothing();
  }
  return hash;
}

/**
 * Writes bytes to the local content-addressed store even if the same hash already has an inline
 * metadata row. This is for third-party text that policy requires to exist only in the local raw
 * store for this ingestion path. Existing raw_payloads rows remain immutable.
 */
export async function putRawFile(db: Db, content: string | Buffer, mediaType: string): Promise<string> {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const hash = sha256(buf);
  const dir = rawStoreDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, hash);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buf, { mode: 0o444 });
  await db
    .insert(rawPayloads)
    .values({ sha256: hash, content: null, bytes: buf.byteLength, storage: "file", path: file, mediaType })
    .onConflictDoNothing();
  return hash;
}

/** Reads a payload and verifies its hash. Throws if the bytes no longer match. */
export async function getRaw(db: Db, hash: string): Promise<Buffer | null> {
  const [row] = await db.select().from(rawPayloads).where(eq(rawPayloads.sha256, hash));
  if (!row) return null;
  const buf =
    row.storage === "inline" ? Buffer.from(row.content ?? "", "utf8") : fs.readFileSync(row.path ?? "");
  if (sha256(buf) !== hash) throw new RawStoreIntegrityError(`raw payload ${hash} failed hash verification`);
  return buf;
}

export async function getRawText(db: Db, hash: string): Promise<string | null> {
  const buf = await getRaw(db, hash);
  return buf ? buf.toString("utf8") : null;
}
