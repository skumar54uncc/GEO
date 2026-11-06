import type { EnvMap } from "./adapter";
import { DEMAND_ADAPTERS } from "./adapters";
import type { DemandConnectionStatus } from "./types";

/** Connection status for every Phase 4 demand adapter. Missing keys → not_connected. */
export function listDemandConnections(env: EnvMap = process.env): DemandConnectionStatus[] {
  return DEMAND_ADAPTERS.map((adapter) => adapter.connectionStatus(env));
}
