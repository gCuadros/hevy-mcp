import { describe, expect, it } from "vitest";
import { HevyClient } from "../hevy/client.js";
import { Store } from "./db.js";
import { sync } from "./sync.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

const routinesPage = { page: 1, page_count: 1, routines: [] };
const routineFoldersPage = { page: 1, page_count: 1, routine_folders: [] };
const exerciseTemplatesPage = { page: 1, page_count: 1, exercise_templates: [] };

function workout(id: string, updatedAt: string) {
  return {
    id,
    title: `Workout ${id}`,
    routine_id: null,
    description: null,
    start_time: updatedAt,
    end_time: updatedAt,
    updated_at: updatedAt,
    created_at: updatedAt,
    exercises: [],
  };
}

describe("sync", () => {
  it("performs a full sync on first run", async () => {
    const workoutsPage = { page: 1, page_count: 1, workouts: [workout("w1", "2026-01-01T00:00:00Z")] };
    const fetchFn = async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path === "/v1/routines") return jsonResponse(routinesPage);
      if (path === "/v1/routine_folders") return jsonResponse(routineFoldersPage);
      if (path === "/v1/exercise_templates") return jsonResponse(exerciseTemplatesPage);
      if (path === "/v1/workouts") return jsonResponse(workoutsPage);
      throw new Error(`unexpected path ${path}`);
    };

    const client = new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch });
    const store = new Store(":memory:");

    const result = await sync(client, store);

    expect(result.mode).toBe("full");
    expect(result.workoutsUpserted).toBe(1);
    expect(store.getWorkoutsCount()).toBe(1);
    expect(store.getSyncState("full_sync_completed")).toBe("true");
  });

  it("performs an incremental sync via workouts/events on subsequent runs", async () => {
    const eventsPage = {
      page: 1,
      page_count: 1,
      events: [
        { type: "updated" as const, workout: workout("w2", "2026-01-02T00:00:00Z") },
        { type: "deleted" as const, id: "w-old", deleted_at: "2026-01-02T00:00:00Z" },
      ],
    };
    const fetchFn = async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path === "/v1/routines") return jsonResponse(routinesPage);
      if (path === "/v1/routine_folders") return jsonResponse(routineFoldersPage);
      if (path === "/v1/exercise_templates") return jsonResponse(exerciseTemplatesPage);
      if (path === "/v1/workouts/events") return jsonResponse(eventsPage);
      throw new Error(`unexpected path ${path}`);
    };

    const client = new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch });
    const store = new Store(":memory:");
    store.setSyncState("full_sync_completed", "true");
    store.setSyncState("last_synced_at", "2026-01-01T00:00:00Z");
    store.upsertWorkout({
      id: "w-old",
      title: "Old",
      routineId: null,
      description: null,
      startTime: new Date("2026-01-01T00:00:00Z"),
      endTime: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      exercises: [],
    });

    const result = await sync(client, store);

    expect(result.mode).toBe("incremental");
    expect(result.workoutsUpserted).toBe(1);
    expect(result.workoutsDeleted).toBe(1);
    expect(store.getWorkoutsCount()).toBe(1);
  });
});
