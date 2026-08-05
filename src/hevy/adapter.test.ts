import { describe, expect, it } from "vitest";
import { AdapterError, toDomainBodyMeasurement, toDomainExerciseSessions, toDomainWorkout } from "./adapter.js";
import type { ExerciseHistoryRow, Workout } from "./schemas.js";

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

describe("toDomainBodyMeasurement", () => {
  it("keeps only the metrics that are really there", () => {
    // The shape a live account returns: no key at all for anything never filled in,
    // plus an id and created_at the OpenAPI document does not mention.
    const domain = toDomainBodyMeasurement({ id: 40027314, date: "2026-03-01", weight_kg: 73.5, created_at: "2026-03-01T15:11:13.347Z" });

    expect(domain).toEqual({ date: "2026-03-01", weightKg: 73.5 });
  });

  it("drops nulls instead of carrying them through as measurements", () => {
    const domain = toDomainBodyMeasurement({ date: "2026-03-01", weight_kg: 73.5, fat_percent: null, waist: null });

    expect(domain).toEqual({ date: "2026-03-01", weightKg: 73.5 });
  });

  it("keeps a zero, which is a value and not an absence", () => {
    const domain = toDomainBodyMeasurement({ date: "2026-03-01", fat_percent: 0 });

    expect(domain).toEqual({ date: "2026-03-01", fatPercent: 0 });
  });

  it("maps the five fields Hevy names without a unit suffix", () => {
    const domain = toDomainBodyMeasurement({ date: "2026-03-01", abdomen: 85, waist: 80, hips: 95, left_thigh: 58.5, right_thigh: 59 });

    expect(domain).toEqual({ date: "2026-03-01", abdomenCm: 85, waistCm: 80, hipsCm: 95, leftThighCm: 58.5, rightThighCm: 59 });
  });
});

function historyRow(overrides: Partial<ExerciseHistoryRow> = {}): ExerciseHistoryRow {
  return {
    workout_id: "w1",
    workout_title: "Push day",
    workout_start_time: "2026-01-01T10:00:00Z",
    workout_end_time: "2026-01-01T11:00:00Z",
    exercise_template_id: "ex1",
    weight_kg: 70,
    reps: 6,
    distance_meters: null,
    duration_seconds: null,
    rpe: null,
    custom_metric: null,
    set_type: "normal",
    ...overrides,
  };
}

describe("toDomainExerciseSessions", () => {
  it("groups the flat rows back into sessions, oldest first", () => {
    const sessions = toDomainExerciseSessions([
      historyRow({ workout_id: "w2", workout_start_time: "2026-02-01T10:00:00Z", workout_end_time: "2026-02-01T11:00:00Z", weight_kg: 75 }),
      historyRow({ weight_kg: 70 }),
      historyRow({ weight_kg: 72 }),
    ]);

    expect(sessions.map((session) => session.workoutId)).toEqual(["w1", "w2"]);
    expect(sessions[0]?.sets.map((set) => set.weightKg)).toEqual([70, 72]);
    expect(sessions[0]?.workoutTitle).toBe("Push day");
    expect(sessions[1]?.startTime.toISOString()).toBe("2026-02-01T10:00:00.000Z");
  });

  it("numbers sets by the order the rows arrived in, since the endpoint sends no index", () => {
    const sessions = toDomainExerciseSessions([historyRow({ reps: 15 }), historyRow({ reps: 6 }), historyRow({ reps: 5 })]);

    expect(sessions[0]?.sets.map((set) => set.order)).toEqual([0, 1, 2]);
  });

  it("keeps identical rows, because three sets of the same thing is the likelier reading", () => {
    const sessions = toDomainExerciseSessions([historyRow(), historyRow(), historyRow()]);

    expect(sessions[0]?.sets).toHaveLength(3);
  });

  it("drops rows with nothing logged in them", () => {
    const sessions = toDomainExerciseSessions([
      historyRow(),
      historyRow({ weight_kg: null, reps: null, distance_meters: null, duration_seconds: null }),
    ]);

    expect(sessions[0]?.sets).toHaveLength(1);
  });

  it("carries the cardio fields, which are all a cardio set has", () => {
    const sessions = toDomainExerciseSessions([
      historyRow({ weight_kg: null, reps: null, distance_meters: 5000, duration_seconds: 1500, set_type: "warmup" }),
    ]);

    expect(sessions[0]?.sets[0]).toEqual({
      order: 0,
      type: "warmup",
      weightKg: null,
      reps: null,
      distanceMeters: 5000,
      durationSeconds: 1500,
      rpe: null,
      customMetric: null,
    });
  });

  it("returns nothing for an exercise with no history", () => {
    expect(toDomainExerciseSessions([])).toEqual([]);
  });
});
