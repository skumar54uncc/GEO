import { describe, expect, it } from "vitest";
import { POST as campaignsPost } from "@/app/api/campaigns/route";
import { GET as overviewGet } from "@/app/api/overview/route";
import { GET as budgetGet } from "@/app/api/budget/route";
import { canApproveSpend, canMutate } from "@/lib/ui/rbac";
import { cookieFor, req, resetDatabase } from "../helpers";

describe("leadership (viewer) RBAC", () => {
  it("canMutate / canApproveSpend hide operator actions for viewers", () => {
    expect(canMutate("viewer")).toBe(false);
    expect(canMutate("editor")).toBe(true);
    expect(canApproveSpend("viewer")).toBe(false);
    expect(canApproveSpend("admin")).toBe(true);
  });

  it("viewer can read overview and budget but cannot create campaigns", async () => {
    await resetDatabase();
    const viewer = await cookieFor("leadership-rbac@charlotte.edu", "viewer");
    expect((await overviewGet(req("/api/overview", { cookie: viewer }))).status).toBe(200);
    expect((await budgetGet(req("/api/budget", { cookie: viewer }))).status).toBe(200);
    const create = await campaignsPost(
      req("/api/campaigns", {
        method: "POST",
        cookie: viewer,
        body: {
          name: "Should fail",
          topic: "x",
          status: "draft",
          engines: [{ engine: "chatgpt", runner: "ui_provider" }],
          region_ids: [],
          persona_ids: [],
        },
      }),
    );
    expect(create.status).toBe(403);
  });
});
