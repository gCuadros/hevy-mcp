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
    const page = await client.getRoutineFolders({ page: 1, pageSize: 5 });
    expect(Array.isArray(page.routine_folders)).toBe(true);
  });

  it("fetches exercise templates matching the schema", async () => {
    const page = await client.getExerciseTemplates({ page: 1, pageSize: 5 });
    expect(page.exercise_templates.length).toBeGreaterThan(0);
  });

  // Read-only on purpose. Nothing here creates or updates a measurement: the API has no
  // delete, so a smoke test that wrote would leave a permanent entry in a real account.
  it("fetches body measurements matching the schema", async () => {
    const page = await client.getBodyMeasurements({ page: 1, pageSize: 5 });
    expect(Array.isArray(page.body_measurements)).toBe(true);
  });

  it("answers null for a date with no measurement instead of throwing", async () => {
    expect(await client.getBodyMeasurementByDate("1970-01-01")).toBeNull();
  });

  it("fetches an exercise's history matching the schema", async () => {
    const templates = await client.getExerciseTemplates({ page: 1, pageSize: 1 });
    const template = templates.exercise_templates[0];
    if (!template) throw new Error("no exercise templates on this account");

    // Any template will do: the schema is what is under test, and an exercise the account
    // has never logged returns an empty array through the same parse.
    expect(Array.isArray(await client.getExerciseHistory(template.id))).toBe(true);
  });

  it("answers 200 with no rows for a template that does not exist, rather than 404", async () => {
    expect(await client.getExerciseHistory("NOTATEMPLATE")).toEqual([]);
  });

  it("fetches workout events matching the schema", async () => {
    const page = await client.getWorkoutEvents({ since: "2020-01-01T00:00:00Z", page: 1, pageSize: 5 });
    expect(page.events.length).toBeGreaterThan(0);
  });
});
