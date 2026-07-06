import { describe, expect, it } from "vitest";
import { HevyClient } from "./client.js";

/**
 * Real-API smoke test: validates that our zod schemas actually match what
 * Hevy returns, not just the public docs. Skipped unless HEVY_API_KEY is set
 * (via .env.local locally, absent in CI).
 */
const apiKey = process.env.HEVY_API_KEY;

describe.skipIf(!apiKey)("HevyClient (real API)", () => {
  const client = new HevyClient({ apiKey: apiKey ?? "" });

  it("fetches the workout count", async () => {
    const count = await client.getWorkoutsCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("fetches a page of workouts matching the schema", async () => {
    const page = await client.getWorkouts({ page: 1, pageSize: 1 });
    expect(page.workouts.length).toBeLessThanOrEqual(1);
  });

  it("fetches routine folders matching the schema", async () => {
    const folders = await client.getRoutineFolders();
    expect(Array.isArray(folders)).toBe(true);
  });

  it("fetches exercise templates matching the schema", async () => {
    const templates = await client.getExerciseTemplates({ page: 1, pageSize: 5 });
    expect(templates.length).toBeGreaterThan(0);
  });
});
