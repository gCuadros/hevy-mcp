import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../store/db.js";
import { comparePeriodsTool, getConsistency, getProgress, getRecords, getVolumeReport } from "./analytics.js";

function template(id: string, title: string, primaryMuscleGroup = "chest") {
  return { id, title, type: "weight_reps", primaryMuscleGroup, secondaryMuscleGroups: [], equipment: null, isCustom: false };
}

function workout(id: string, startTime: string, sets: { weightKg: number; reps: number; type?: string }[]) {
  return {
    id,
    title: `Workout ${id}`,
    routineId: null,
    description: null,
    startTime: new Date(startTime),
    endTime: new Date(startTime),
    updatedAt: new Date(startTime),
    createdAt: new Date(startTime),
    exercises: [
      {
        index: 0,
        title: "Bench Press",
        exerciseTemplateId: "bench1",
        supersetId: null,
        notes: null,
        sets: sets.map((s, i) => ({
          index: i,
          type: (s.type ?? "normal") as "normal",
          weightKg: s.weightKg,
          reps: s.reps,
          distanceMeters: null,
          durationSeconds: null,
          rpe: null,
        })),
      },
    ],
  };
}

describe("analytics tools", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(":memory:");
    store.upsertExerciseTemplate(template("bench1", "Bench Press"));
    store.upsertWorkout(workout("w1", "2026-01-05T00:00:00Z", [{ weightKg: 100, reps: 5 }]));
    store.upsertWorkout(workout("w2", "2026-01-12T00:00:00Z", [{ weightKg: 105, reps: 5 }]));
  });

  it("getProgress returns the e1RM trend sorted chronologically", () => {
    const result = getProgress({ store }, { exercise: "bench1" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.progress).toHaveLength(2);
      expect(result.progress[0]?.workoutId).toBe("w1");
      expect(result.progress[1]?.workoutId).toBe("w2");
      expect(result.progress[1]?.e1rm).toBeGreaterThan(result.progress[0]?.e1rm ?? 0);
    }
  });

  it("getProgress passes through ambiguity", () => {
    store.upsertExerciseTemplate(template("bench2", "Bench Press (Incline)"));
    const result = getProgress({ store }, { exercise: "bench" });
    expect(result.status).toBe("ambiguous");
  });

  it("getRecords finds the heaviest set per rep bracket for the resolved exercise", () => {
    const result = getRecords({ store }, { exercise: "Bench Press" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.records[5]?.weightKg).toBe(105);
    }
  });

  it("getVolumeReport groups tonnage by muscle group and week", () => {
    const result = getVolumeReport({ store });
    expect(result.weeks.length).toBeGreaterThan(0);
    expect(result.weeks[0]?.muscleGroup).toBe("chest");
  });

  it("getConsistency reports workout count and current streak", () => {
    const result = getConsistency({ store });
    expect(result.workoutCount).toBe(2);
  });

  it("comparePeriodsTool diffs a period against the previous one", () => {
    const result = comparePeriodsTool({ store }, { from: "2026-01-10T00:00:00Z", to: "2026-01-20T00:00:00Z" });
    expect(result.current.workoutCount).toBe(1);
    expect(result.previous.workoutCount).toBe(1);
  });
});
