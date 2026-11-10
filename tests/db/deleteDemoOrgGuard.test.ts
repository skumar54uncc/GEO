import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAllDataForOrg } from "@/lib/demo/deleteDemoOrgData";
import { DEFAULT_ORG_SLUG, legacyContext } from "@/lib/db/pg/bootstrap";
import { getDb } from "@/lib/db/pg/client";
import { organizations } from "@/lib/db/pg/schema";
import { resetDatabase } from "../helpers";

describe("R5: deleteAllDataForOrg refuses non-demo orgs", () => {
  beforeEach(resetDatabase);

  it("throws on UNC Charlotte and changes nothing", async () => {
    const db = getDb();
    const { orgId } = await legacyContext(db);
    const [before] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(before.slug).toBe(DEFAULT_ORG_SLUG);
    expect(before.isDemo).toBe(false);
    expect(before.archivedAt).toBeNull();

    await expect(deleteAllDataForOrg(db, orgId)).rejects.toThrow(/demo/i);

    const [after] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(after).toEqual(before);
  });
});
