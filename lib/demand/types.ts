import { demandSourceEnum } from "@/lib/db/pg/schema";

export type DemandSource = (typeof demandSourceEnum.enumValues)[number];

export type DemandConnectionStatus = {
  id: string;
  source: DemandSource;
  label: string;
  provider: string;
  connected: boolean;
  status: "connected" | "not_connected";
  missing: string[];
  mode: "fixture_only";
  note: string;
};

export type DemandRequest = {
  campaignId: string;
  term: string;
  regionLabel?: string | null;
};

export type DemandSignalValue = Record<string, unknown>;

export type DemandFixtureSignal = {
  term: string;
  value: DemandSignalValue;
};

export type DemandFixture = {
  signals: DemandFixtureSignal[];
};

export type DemandEstimate = {
  provider: string;
  source: DemandSource;
  mode: "fixture_only";
  units: number;
  priceUsd: null;
  paramsHash: string;
  available: boolean;
  connected: boolean;
  status: "connected" | "not_connected";
  missing: string[];
};

export type DemandApproval = {
  paramsHash: string;
  units: number;
  priceUsd: null;
  acknowledgedUnknownPrice: true;
};

export type DemandRunResult =
  | {
      connected: false;
      status: "not_connected";
      source: DemandSource;
      missing: string[];
      mode: "fixture_only";
      signals: [];
    }
  | {
      connected: true;
      status: "ok";
      source: DemandSource;
      mode: "fixture_only";
      paramsHash: string;
      signals: Array<{ term: string; value: DemandSignalValue; source: DemandSource }>;
    };

export class DemandNotConnectedError extends Error {
  readonly status = "not_connected" as const;
  constructor(
    message: string,
    public missing: string[],
  ) {
    super(message);
  }
}

export class DemandApprovalError extends Error {}
export class DemandUnavailableError extends Error {}
