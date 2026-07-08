import type { HevyClient } from "../hevy/client.js";

export interface ToolDeps {
  client: HevyClient;
}

export interface HealthCheckResult {
  status: "ok" | "error";
  hevyWorkoutCount?: number;
  error?: string;
}

/** Confirms the Hevy API key works. Meant to be called first when troubleshooting a connection issue. */
export async function runHealthCheck(deps: ToolDeps): Promise<HealthCheckResult> {
  try {
    const hevyWorkoutCount = await deps.client.getWorkoutsCount();
    return { status: "ok", hevyWorkoutCount };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}
