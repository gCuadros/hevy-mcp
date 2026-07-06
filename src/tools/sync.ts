import type { HevyClient } from "../hevy/client.js";
import type { Store } from "../store/db.js";
import { sync, type SyncResult } from "../store/sync.js";

export interface ToolDeps {
  client: HevyClient;
  store: Store;
}

export interface HealthCheckResult {
  status: "ok" | "error";
  hevyWorkoutCount?: number;
  cachedWorkoutCount: number;
  lastSyncedAt: string | null;
  error?: string;
}

/**
 * Confirms the Hevy API key works and reports cache freshness. Meant to be
 * called first when troubleshooting, or before relying on cached analytics.
 */
export async function runHealthCheck(deps: ToolDeps): Promise<HealthCheckResult> {
  const cachedWorkoutCount = deps.store.getWorkoutsCount();
  const lastSyncedAt = deps.store.getSyncState("last_synced_at");

  try {
    const hevyWorkoutCount = await deps.client.getWorkoutsCount();
    return { status: "ok", hevyWorkoutCount, cachedWorkoutCount, lastSyncedAt };
  } catch (error) {
    return {
      status: "error",
      cachedWorkoutCount,
      lastSyncedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSync(deps: ToolDeps): Promise<SyncResult> {
  return sync(deps.client, deps.store);
}
