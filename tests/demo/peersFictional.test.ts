import { describe, expect, it } from "vitest";
import { DEMO_PEER_INSTITUTIONS } from "@/lib/demo/seedMarked";
import { FORBIDDEN_REAL_INSTITUTION_NAMES, isForbiddenRealInstitutionName } from "@/lib/demo/forbiddenRealInstitutions";

describe("demo competitors are fictional", () => {
  it("does not match any real IPEDS institution name in our seed list", () => {
    for (const peer of DEMO_PEER_INSTITUTIONS) {
      expect(isForbiddenRealInstitutionName(peer.name), peer.name).toBe(false);
      for (const alias of peer.aliases) {
        expect(isForbiddenRealInstitutionName(alias), alias).toBe(false);
      }
    }
    // Sanity: the forbid list itself includes known reals.
    expect(FORBIDDEN_REAL_INSTITUTION_NAMES.length).toBeGreaterThan(5);
    expect(isForbiddenRealInstitutionName("Duke University")).toBe(true);
  });

  it("uses example.test peer domains, not real .edu hosts", () => {
    for (const peer of DEMO_PEER_INSTITUTIONS) {
      expect(peer.domain).toMatch(/\.example\.test$/);
    }
  });
});
