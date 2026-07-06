import { describe, expect, it } from "vitest";
import { AdapterError, toDomainWorkout } from "./adapter.js";
import type { Workout } from "./schemas.js";

function baseWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    title: "Push day",
    routine_id: null,
    description: null,
    start_time: "2026-01-01T10:00:00Z",
    end_time: "2026-01-01T11:00:00Z",
    updated_at: "2026-01-01T11:00:00Z",
    created_at: "2026-01-01T10:00:00Z",
    exercises: [],
    ...overrides,
  };
}

describe("toDomainWorkout", () => {
  it("drops sets with no meaningful data (reps/weight/distance/duration all null)", () => {
    const workout = baseWorkout({
      exercises: [
        {
          index: 0,
          title: "Bench Press",
          notes: null,
          exercise_template_id: "ex1",
          superset_id: null,
          sets: [
            { index: 0, type: "normal", weight_kg: 80, reps: 5, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
            { index: 1, type: "normal", weight_kg: null, reps: null, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
          ],
        },
      ],
    });

    const domain = toDomainWorkout(workout);

    expect(domain.exercises[0]?.sets).toHaveLength(1);
    expect(domain.exercises[0]?.sets[0]?.weightKg).toBe(80);
  });

  it("collapses duplicate set indices, keeping the last occurrence", () => {
    const workout = baseWorkout({
      exercises: [
        {
          index: 0,
          title: "Squat",
          notes: null,
          exercise_template_id: "ex2",
          superset_id: null,
          sets: [
            { index: 0, type: "normal", weight_kg: 100, reps: 5, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
            { index: 0, type: "normal", weight_kg: 105, reps: 3, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
          ],
        },
      ],
    });

    const domain = toDomainWorkout(workout);

    expect(domain.exercises[0]?.sets).toHaveLength(1);
    expect(domain.exercises[0]?.sets[0]?.weightKg).toBe(105);
  });

  it("throws AdapterError on an invalid date", () => {
    const workout = baseWorkout({ start_time: "not-a-date" });

    expect(() => toDomainWorkout(workout)).toThrow(AdapterError);
  });
});
