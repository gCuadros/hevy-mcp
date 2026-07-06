import { describe, expect, it } from "vitest";
import { HevyApiError, HevyClient } from "./client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HevyClient", () => {
  it("parses a workouts page into the expected shape", async () => {
    const fetchFn = async () =>
      jsonResponse({
        page: 1,
        page_count: 1,
        workouts: [
          {
            id: "w1",
            title: "Push day",
            description: null,
            start_time: "2026-01-01T10:00:00Z",
            end_time: "2026-01-01T11:00:00Z",
            updated_at: "2026-01-01T11:00:00Z",
            created_at: "2026-01-01T10:00:00Z",
            exercises: [
              {
                index: 0,
                title: "Bench Press",
                notes: null,
                exercise_template_id: "ex1",
                superset_id: null,
                sets: [
                  {
                    index: 0,
                    type: "normal",
                    weight_kg: 80,
                    reps: 5,
                    distance_meters: null,
                    duration_seconds: null,
                    rpe: 8,
                    custom_metric: null,
                  },
                ],
              },
            ],
          },
        ],
      });

    const client = new HevyClient({ apiKey: "test-key", fetchFn });
    const page = await client.getWorkouts();

    expect(page.workouts).toHaveLength(1);
    expect(page.workouts[0]?.exercises[0]?.sets[0]?.weight_kg).toBe(80);
  });

  it("throws an actionable HevyApiError on 401", async () => {
    const fetchFn = async () => jsonResponse({ message: "unauthorized" }, 401);
    const client = new HevyClient({ apiKey: "bad-key", fetchFn });

    await expect(client.getWorkouts()).rejects.toThrow(HevyApiError);
    await expect(client.getWorkouts()).rejects.toThrow(/Regenerate it/);
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      if (calls < 3) return jsonResponse({}, 429);
      return jsonResponse({ workout_count: 42 });
    };

    const client = new HevyClient({ apiKey: "test-key", fetchFn });
    const count = await client.getWorkoutsCount();

    expect(count).toBe(42);
    expect(calls).toBe(3);
  });
});
