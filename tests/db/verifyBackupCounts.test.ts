import { describe, expect, it } from "vitest";
import { compareTableCounts } from "@/lib/db/pg/backupGuard";

describe("R4: verify-backup count compare", () => {
  it("PASS when counts match", () => {
    const live = { audit_log: 2, organizations: 1 };
    expect(compareTableCounts(live, { ...live }).ok).toBe(true);
  });

  it("FAIL when a table count differs", () => {
    const result = compareTableCounts({ audit_log: 2 }, { audit_log: 1 });
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([{ table: "audit_log", live: 2, restored: 1 }]);
  });
});
