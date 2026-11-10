import { describe, expect, it } from "vitest";
import { DEMO_SEED_MARKER } from "@/lib/contracts";
import {
  FORBIDDEN_REAL_EDU_DOMAINS,
  isForbiddenRealEduDomain,
} from "@/lib/demo/forbiddenRealInstitutions";
import { DEMO_PEER_INSTITUTIONS } from "@/lib/demo/seedMarked";

/** Domains the demo seed cites (peers + brand + editorial/gov fixtures). Must stay fictional. */
const DEMO_CITED_PAGE_DOMAINS = [
  "demo.example.test",
  "news.example.test",
  "example.gov",
  "peer.edu-review.test",
  ...DEMO_PEER_INSTITUTIONS.map((p) => p.domain),
] as const;

/**
 * Hosts that appear in IPEDS/Scorecard-style peer tables for real NC/regional schools.
 * A demo cited_page must never reuse these (forbid-list ∪ known Scorecard .edu hosts).
 */
const IPEDS_PEER_TABLE_EDU_DOMAINS = [
  ...FORBIDDEN_REAL_EDU_DOMAINS,
  "ncsu.edu",
  "duke.edu",
  "unc.edu",
  "clemson.edu",
  "vt.edu",
  "charlotte.edu",
  "uncc.edu",
  "wfu.edu",
  "ecu.edu",
  "appstate.edu",
  "sc.edu",
  "ncat.edu",
  "uncg.edu",
  "unca.edu",
  "uncw.edu",
] as const;

describe("demo cited_pages domains are fictional", () => {
  it("tags every demo cited page with demo_seed:v1 marker constant", () => {
    expect(DEMO_SEED_MARKER).toBe("demo_seed:v1");
  });

  it("uses example.test / fixture hosts, never a real .edu from the forbid-list or IPEDS peers table", () => {
    for (const domain of DEMO_CITED_PAGE_DOMAINS) {
      expect(isForbiddenRealEduDomain(domain), domain).toBe(false);
      for (const real of IPEDS_PEER_TABLE_EDU_DOMAINS) {
        const host = domain as string;
        const edu = real as string;
        expect(host === edu || host.endsWith(`.${edu}`), `${host} vs ${edu}`).toBe(false);
      }
    }
  });

  it("fails if a demo domain accidentally matches a known .edu", () => {
    expect(isForbiddenRealEduDomain("admissions.duke.edu")).toBe(true);
    expect(isForbiddenRealEduDomain("coastal-state.example.test")).toBe(false);
  });
});
