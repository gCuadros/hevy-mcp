import { describe, expect, it } from "vitest";
import { buildTestClient, exerciseTemplateDto, workoutDto } from "../hevy/testFixtures.js";
import { comparePeriodsTool, getConsistency, getProgress, getRecords, getVolumeReport } from "./analytics.js";

function testDeps() {
  const client = buildTestClient({
    exerciseTemplates: [exerciseTemplateDto("bench1", "Bench Press")],
    workouts: [
      workoutDto("w1", "2026-01-05T00:00:00Z", "bench1", [{ weightKg: 100, reps: 5 }]),
      workoutDto("w2", "2026-01-12T00:00:00Z", "bench1", [{ weightKg: 105, reps: 5 }]),
    ],
  });
  return { client };
}

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
