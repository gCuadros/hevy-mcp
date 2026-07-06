import { describe, expect, it } from "vitest";
import { comparePeriods } from "./compare.js";

describe("comparePeriods", () => {
  it("compares a period against the immediately preceding period of equal length", () => {
    const sessions = [
      // Previous period (2 weeks before "from")
      {
        startTime: new Date("2025-12-15T10:00:00Z"),
        exercises: [{ sets: [{ type: "normal", weightKg: 100, reps: 5 }] }],
      },
      // Current period
      {
        startTime: new Date("2026-01-05T10:00:00Z"),
        exercises: [
          {
            sets: [
              { type: "normal", weightKg: 100, reps: 5 },
              { type: "normal", weightKg: 100, reps: 5 },
              { type: "warmup", weightKg: 40, reps: 10 },
            ],
          },
        ],
      },
    ];

    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-31T23:59:59Z");

    const result = comparePeriods(sessions, from, to);

    expect(result.current).toEqual({ workoutCount: 1, effectiveSets: 2, tonnageKg: 1000 });
    expect(result.previous).toEqual({ workoutCount: 1, effectiveSets: 1, tonnageKg: 500 });
    expect(result.delta).toEqual({ workoutCount: 0, effectiveSets: 1, tonnageKg: 500 });
  });

  it("handles an empty comparison with no workouts in either period", () => {
    const result = comparePeriods([], new Date("2026-01-01T00:00:00Z"), new Date("2026-01-31T23:59:59Z"));

    expect(result.current).toEqual({ workoutCount: 0, effectiveSets: 0, tonnageKg: 0 });
    expect(result.previous).toEqual({ workoutCount: 0, effectiveSets: 0, tonnageKg: 0 });
    expect(result.delta).toEqual({ workoutCount: 0, effectiveSets: 0, tonnageKg: 0 });
  });
});
