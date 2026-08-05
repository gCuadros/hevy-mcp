import { describe, expect, it } from "vitest";
import { bodyMeasurementDto, buildTestClient, exerciseTemplateDto, workoutDto } from "../hevy/testFixtures.js";
import { comparePeriodsTool, getBodyweightTrend, getConsistency, getProgress, getRecords, getVolumeReport } from "./analytics.js";

function testDeps(bodyMeasurements: ReturnType<typeof bodyMeasurementDto>[] = []) {
  const client = buildTestClient({
    exerciseTemplates: [exerciseTemplateDto("bench1", "Bench Press")],
    workouts: [
      workoutDto("w1", "2026-01-05T00:00:00Z", "bench1", [{ weightKg: 100, reps: 5 }]),
      workoutDto("w2", "2026-01-12T00:00:00Z", "bench1", [{ weightKg: 105, reps: 5 }]),
    ],
    bodyMeasurements,
  });
  return { client };
}

const weighIns = [bodyMeasurementDto("2026-01-04", { weight_kg: 80 }), bodyMeasurementDto("2026-01-11", { weight_kg: 79 })];

describe("analytics tools", () => {
  it("getProgress returns the e1RM trend sorted chronologically", async () => {
    const result = await getProgress(testDeps(), { exercise: "bench1" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.progress).toHaveLength(2);
      expect(result.progress[0]?.workoutId).toBe("w1");
      expect(result.progress[1]?.workoutId).toBe("w2");
      expect(result.progress[1]?.e1rm).toBeGreaterThan(result.progress[0]?.e1rm ?? 0);
    }
  });

  it("getProgress leaves bodyweight out unless it is asked for", async () => {
    const result = await getProgress(testDeps(weighIns), { exercise: "bench1" });
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.bodyweightCoverage).toBeUndefined();
    expect(result.progress[0]).not.toHaveProperty("bodyweightKg");
  });

  it("getProgress attaches the nearest weigh-in and the relative e1RM when asked", async () => {
    const result = await getProgress(testDeps(weighIns), { exercise: "bench1", relativeToBodyweight: true });
    if (result.status !== "resolved") throw new Error("expected resolved");

    // 100x5 -> e1RM 116.7, nearest weigh-in 2026-01-04 at 80 kg: 116.7/80 = 1.45875 -> 1.459
    expect(result.progress[0]).toMatchObject({ e1rm: 116.7, bodyweightKg: 80, bodyweightMeasuredOn: "2026-01-04", relativeE1rm: 1.459 });
    // 105x5 -> e1RM 122.5, nearest weigh-in 2026-01-11 at 79 kg: 122.5/79 = 1.55063 -> 1.551
    expect(result.progress[1]).toMatchObject({ e1rm: 122.5, bodyweightKg: 79, bodyweightMeasuredOn: "2026-01-11", relativeE1rm: 1.551 });
    expect(result.bodyweightCoverage).toEqual({ sessionsWithBodyweight: 2, sessionsTotal: 2, weighInsFound: 2 });
  });

  it("getProgress reports the sessions no weigh-in could cover rather than inventing one", async () => {
    const stale = [bodyMeasurementDto("2025-11-01", { weight_kg: 85 })];
    const result = await getProgress(testDeps(stale), { exercise: "bench1", relativeToBodyweight: true });
    if (result.status !== "resolved") throw new Error("expected resolved");

    expect(result.progress[0]).not.toHaveProperty("relativeE1rm");
    expect(result.bodyweightCoverage).toEqual({ sessionsWithBodyweight: 0, sessionsTotal: 2, weighInsFound: 1 });
  });

  it("getBodyweightTrend reports the change and the weekly rate", async () => {
    // 80 -> 79 over exactly one week: -1 kg, -1.25%, and the same again per week.
    const result = await getBodyweightTrend(testDeps(weighIns));
    expect(result.trend).toMatchObject({ changeKg: -1, changePercent: -1.25, spanDays: 7, perWeekKg: -1, perWeekPercent: -1.25 });
    expect(result.series).toHaveLength(2);
  });

  it("getBodyweightTrend returns the weigh-ins but no trend below two of them", async () => {
    const result = await getBodyweightTrend(testDeps([weighIns[0] as ReturnType<typeof bodyMeasurementDto>]));
    expect(result.trend).toBeNull();
    expect(result.series).toEqual([{ date: "2026-01-04", weightKg: 80 }]);
  });

  it("getProgress passes through ambiguity", async () => {
    const client = buildTestClient({
      exerciseTemplates: [exerciseTemplateDto("bench1", "Bench Press"), exerciseTemplateDto("bench2", "Bench Press (Incline)")],
      workouts: [],
    });
    const result = await getProgress({ client }, { exercise: "bench" });
    expect(result.status).toBe("ambiguous");
  });

  it("getRecords finds the heaviest set per rep bracket for the resolved exercise", async () => {
    const result = await getRecords(testDeps(), { exercise: "Bench Press" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.records[5]?.weightKg).toBe(105);
    }
  });

  it("getVolumeReport groups tonnage by muscle group and week", async () => {
    const result = await getVolumeReport(testDeps());
    expect(result.weeks.length).toBeGreaterThan(0);
    expect(result.weeks[0]?.muscleGroup).toBe("chest");
  });

  it("getConsistency reports workout count and current streak", async () => {
    const result = await getConsistency(testDeps());
    expect(result.workoutCount).toBe(2);
  });

  it("comparePeriodsTool diffs a period against the previous one", async () => {
    const result = await comparePeriodsTool(testDeps(), { from: "2026-01-10T00:00:00Z", to: "2026-01-20T00:00:00Z" });
    expect(result.current.workoutCount).toBe(1);
    expect(result.previous.workoutCount).toBe(1);
  });
});
