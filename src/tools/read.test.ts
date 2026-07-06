import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "../store/db.js";
import { getExerciseHistory, getWorkouts, resolveExercise, searchExercises } from "./read.js";

function template(id: string, title: string) {
  return { id, title, type: "weight_reps", primaryMuscleGroup: "chest", secondaryMuscleGroups: [], equipment: null, isCustom: false };
}

function workout(id: string, startTime: string, exerciseTemplateId: string, weightKg: number) {
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
        exerciseTemplateId,
        supersetId: null,
        notes: null,
        sets: [{ index: 0, type: "normal" as const, weightKg, reps: 5, distanceMeters: null, durationSeconds: null, rpe: null }],
      },
    ],
  };
}

describe("read tools", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(":memory:");
    store.upsertExerciseTemplate(template("bench1", "Bench Press"));
    store.upsertExerciseTemplate(template("bench2", "Bench Press (Incline)"));
    store.upsertWorkout(workout("w1", "2026-01-01T00:00:00Z", "bench1", 80));
    store.upsertWorkout(workout("w2", "2026-01-08T00:00:00Z", "bench1", 85));
  });

  it("getWorkouts filters by date range and limit", () => {
    const result = getWorkouts({ store }, { from: "2026-01-05T00:00:00Z", limit: 10 });
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]?.id).toBe("w2");
  });

  it("searchExercises matches by substring, case-insensitively", () => {
    const result = searchExercises({ store }, { query: "bench" });
    expect(result.matches).toHaveLength(2);
  });

  it("resolveExercise returns ambiguous when multiple titles match", () => {
    const result = resolveExercise({ store }, "bench");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") expect(result.candidates).toHaveLength(2);
  });

  it("resolveExercise resolves an exact title match even with a substring collision", () => {
    const result = resolveExercise({ store }, "Bench Press");
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.template.id).toBe("bench1");
  });

  it("resolveExercise returns not-found for an unknown exercise", () => {
    const result = resolveExercise({ store }, "Nonexistent Exercise");
    expect(result.status).toBe("not-found");
  });

  it("getExerciseHistory returns sets across workouts sorted by most recent first", () => {
    const result = getExerciseHistory({ store }, { exercise: "bench1" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.history).toHaveLength(2);
      expect(result.history[0]?.workoutId).toBe("w2");
      expect(result.history[0]?.sets[0]?.weightKg).toBe(85);
    }
  });

  it("getExerciseHistory passes through ambiguity instead of guessing", () => {
    const result = getExerciseHistory({ store }, { exercise: "bench" });
    expect(result.status).toBe("ambiguous");
  });
});
