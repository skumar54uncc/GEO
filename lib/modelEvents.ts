import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/campaigns";
import { ENGINES } from "@/lib/capture/types";
import type { Db } from "@/lib/db/pg/client";
import { modelEvents } from "@/lib/db/pg/schema";

export type ModelEventRow = typeof modelEvents.$inferSelect;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "occurred_on must be YYYY-MM-DD").refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "occurred_on is not a real date");

const sourceUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "source_url must be http or https")
  .nullable()
  .optional();

export const modelEventInput = z.object({
  engine: z.enum(ENGINES),
  occurred_on: isoDate,
  note: z.string().trim().min(1, "note is required").max(2000),
  source_url: sourceUrl,
});

export const modelEventPatch = z
  .object({
    engine: z.enum(ENGINES),
    occurred_on: isoDate,
    note: z.string().trim().min(1).max(2000),
    source_url: sourceUrl,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const res = schema.safeParse(input);
  if (!res.success) throw new ValidationError(res.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return res.data;
}

/** Model events are annotations on time series (ARCHITECTURE principle 7). They are not org data; admins write them. */
export async function listModelEvents(db: Db, engine?: string | null): Promise<ModelEventRow[]> {
  const q = db.select().from(modelEvents);
  return (engine ? q.where(eq(modelEvents.engine, engine as ModelEventRow["engine"])) : q).orderBy(desc(modelEvents.occurredOn), desc(modelEvents.createdAt));
}

export async function createModelEvent(db: Db, input: unknown): Promise<ModelEventRow> {
  const v = parse(modelEventInput, input);
  const [row] = await db
    .insert(modelEvents)
    .values({ engine: v.engine, occurredOn: v.occurred_on, note: v.note, sourceUrl: v.source_url ?? null })
    .returning();
  return row;
}

export async function getModelEvent(db: Db, id: string): Promise<ModelEventRow> {
  const [row] = await db.select().from(modelEvents).where(eq(modelEvents.id, id));
  if (!row) throw new NotFoundError("Model event not found.");
  return row;
}

export async function updateModelEvent(db: Db, id: string, input: unknown): Promise<ModelEventRow> {
  const v = parse(modelEventPatch, input);
  await getModelEvent(db, id);
  const [row] = await db
    .update(modelEvents)
    .set({
      ...(v.engine !== undefined ? { engine: v.engine } : {}),
      ...(v.occurred_on !== undefined ? { occurredOn: v.occurred_on } : {}),
      ...(v.note !== undefined ? { note: v.note } : {}),
      ...(v.source_url !== undefined ? { sourceUrl: v.source_url } : {}),
    })
    .where(eq(modelEvents.id, id))
    .returning();
  return row;
}

export async function deleteModelEvent(db: Db, id: string): Promise<ModelEventRow> {
  const [row] = await db.delete(modelEvents).where(eq(modelEvents.id, id)).returning();
  if (!row) throw new NotFoundError("Model event not found.");
  return row;
}
