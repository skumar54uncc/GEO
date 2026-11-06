import crypto from "crypto";
import type { Db } from "@/lib/db/pg/client";
import { checkBudget } from "@/lib/cost/guard";
import {
  DemandApprovalError,
  DemandNotConnectedError,
  DemandUnavailableError,
  type DemandApproval,
  type DemandConnectionStatus,
  type DemandEstimate,
  type DemandFixture,
  type DemandRequest,
  type DemandRunResult,
  type DemandSource,
} from "./types";

export type EnvMap = Record<string, string | undefined>;

export type DemandAdapterConfig = {
  id: string;
  source: DemandSource;
  label: string;
  provider: string;
  requiredEnv: string[];
  note: string;
  /** Custom missing-config resolver. Defaults to checking requiredEnv. */
  resolveMissing?: (env: EnvMap) => string[];
};

function defaultMissing(env: EnvMap, keys: string[]): string[] {
  return keys.filter((key) => !String(env[key] ?? "").trim());
}

function normalized(request: DemandRequest): DemandRequest {
  return {
    campaignId: request.campaignId,
    term: request.term.trim(),
    regionLabel: request.regionLabel?.trim() || null,
  };
}

export function createDemandAdapter(config: DemandAdapterConfig) {
  function missing(env: EnvMap): string[] {
    return config.resolveMissing ? config.resolveMissing(env) : defaultMissing(env, config.requiredEnv);
  }

  function connectionStatus(env: EnvMap = process.env): DemandConnectionStatus {
    const missingKeys = missing(env);
    const connected = missingKeys.length === 0;
    return {
      id: config.id,
      source: config.source,
      label: config.label,
      provider: config.provider,
      connected,
      status: connected ? "connected" : "not_connected",
      missing: missingKeys,
      mode: "fixture_only",
      note: config.note,
    };
  }

  function estimate(request: DemandRequest, env: EnvMap = process.env): DemandEstimate {
    const status = connectionStatus(env);
    const paramsHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ source: config.source, ...normalized(request) }))
      .digest("hex");
    return {
      provider: config.provider,
      source: config.source,
      mode: "fixture_only",
      units: 1,
      priceUsd: null,
      paramsHash,
      available: true,
      connected: status.connected,
      status: status.status,
      missing: status.missing,
    };
  }

  async function run(
    db: Db,
    input: {
      orgId: string;
      request: DemandRequest;
      approval?: DemandApproval;
      fixture?: DemandFixture;
      env?: EnvMap;
    },
  ): Promise<DemandRunResult> {
    const env = input.env ?? process.env;
    const status = connectionStatus(env);
    if (!status.connected) {
      return {
        connected: false,
        status: "not_connected",
        source: config.source,
        missing: status.missing,
        mode: "fixture_only",
        signals: [],
      };
    }

    const est = estimate(input.request, env);
    if (!input.fixture) {
      throw new DemandUnavailableError(
        `${config.label} live capability is unavailable; only an explicitly supplied test fixture can run.`,
      );
    }
    const approval = input.approval;
    if (
      !approval ||
      approval.paramsHash !== est.paramsHash ||
      approval.units !== est.units ||
      approval.priceUsd !== null ||
      approval.acknowledgedUnknownPrice !== true
    ) {
      throw new DemandApprovalError("Explicit approval must exactly match the current estimate.");
    }

    const budget = await checkBudget(db, input.orgId, config.provider, {
      units: est.units,
      uncachedUnits: est.units,
      usd: null,
    });
    if (!budget.allowed) throw new DemandApprovalError(budget.reason ?? "Cost guard refused the fixture run.");

    return {
      connected: true,
      status: "ok",
      source: config.source,
      mode: "fixture_only",
      paramsHash: est.paramsHash,
      signals: input.fixture.signals.map((signal) => ({
        term: signal.term,
        value: { ...signal.value },
        source: config.source,
      })),
    };
  }

  function assertConnected(env: EnvMap = process.env): void {
    const status = connectionStatus(env);
    if (!status.connected) {
      throw new DemandNotConnectedError(`${config.label} is not connected.`, status.missing);
    }
  }

  return { config, connectionStatus, estimate, run, assertConnected };
}

export type DemandAdapter = ReturnType<typeof createDemandAdapter>;
