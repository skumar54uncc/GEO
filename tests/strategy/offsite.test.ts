import { describe, expect, it } from "vitest";
import { buildOffsiteOpportunities } from "@/lib/strategy/offsite";

describe("strategy offsite", () => {
  it("lists third-party domains that cite peers but not us", () => {
    const rows = buildOffsiteOpportunities([
      {
        domain: "usnews.com",
        sourceClass: "ranking",
        url: "https://usnews.com/best-energy",
        citesUs: false,
        citesPeer: true,
      },
      {
        domain: "usnews.com",
        sourceClass: "ranking",
        url: "https://usnews.com/best-energy-2",
        citesUs: false,
        citesPeer: true,
      },
      {
        domain: "charlotte.edu",
        sourceClass: "owned",
        url: "https://charlotte.edu/energy",
        citesUs: true,
        citesPeer: false,
      },
      {
        domain: "niche.com",
        sourceClass: "ranking",
        url: "https://niche.com/colleges",
        citesUs: true,
        citesPeer: true,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      domain: "usnews.com",
      sourceClass: "ranking",
      peerCitationCount: 2,
      ourCitationCount: 0,
      n: 2,
    });
    expect(rows[0].exampleUrls).toHaveLength(2);
  });
});
