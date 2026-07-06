import { describe, expect, it } from "vitest";
import { HevyClient } from "../hevy/client.js";
import { Store } from "../store/db.js";
import { runHealthCheck, runSync } from "./sync.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("runHealthCheck", () => {
  it("reports ok status with cache and live counts", async () => {
    const fetchFn = async () => jsonResponse({ workout_count: 7 });
    const client = new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch });
    const store = new Store(":memory:");

    const result = await runHealthCheck({ client, store });

    expect(result.status).toBe("ok");
    expect(result.hevyWorkoutCount).toBe(7);
    expect(result.cachedWorkoutCount).toBe(0);
  });

  it("reports error status with an actionable message on an invalid key", async () => {
    const fetchFn = async () => jsonResponse({}, 401);
    const client = new HevyClient({ apiKey: "bad", fetchFn: fetchFn as typeof fetch });
    const store = new Store(":memory:");

    const result = await runHealthCheck({ client, store });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/Regenerate it/);
  });
});

describe("runSync", () => {
  it("delegates to the sync module and returns its result", async () => {
    const workoutsPage = { page: 1, page_count: 1, workouts: [] };
    const emptyPage = { page: 1, page_count: 1 };
    const fetchFn = async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path === "/v1/routines") return jsonResponse({ ...emptyPage, routines: [] });
      if (path === "/v1/routine_folders") return jsonResponse({ ...emptyPage, routine_folders: [] });
      if (path === "/v1/exercise_templates") return jsonResponse({ ...emptyPage, exercise_templates: [] });
      if (path === "/v1/workouts") return jsonResponse(workoutsPage);
      throw new Error(`unexpected path ${path}`);
    };
    const client = new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch });
    const store = new Store(":memory:");

    const result = await runSync({ client, store });

    expect(result.mode).toBe("full");
    expect(result.workoutsUpserted).toBe(0);
  });
});
