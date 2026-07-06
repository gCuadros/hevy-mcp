import { describe, expect, it } from "vitest";
import { weeklyVolumeByMuscleGroup, weekStart } from "./volume.js";

describe("weekStart", () => {
  it("returns the Monday of the week for a mid-week date", () => {
    // 2026-01-07 is a Wednesday -> Monday 2026-01-05
    expect(weekStart(new Date("2026-01-07T12:00:00Z"))).toBe("2026-01-05");
  });

  it("returns the same date for a Monday", () => {
    expect(weekStart(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("handles Sunday correctly (belongs to the previous Monday's week)", () => {
    expect(weekStart(new Date("2026-01-11T00:00:00Z"))).toBe("2026-01-05");
  });
});

describe("weeklyVolumeByMuscleGroup", () => {
  it("sums tonnage and excludes warmup sets from the effective set count", () => {
    const sessions = [
      {
        startTime: new Date("2026-01-07T00:00:00Z"),
        exercises: [
          {
            exerciseTemplateId: "bench1",
            sets: [
              { type: "warmup", weightKg: 40, reps: 10 },
              { type: "normal", weightKg: 100, reps: 5 },
              { type: "normal", weightKg: 100, reps: 5 },
            ],
          },
        ],
      },
    ];

    const result = weeklyVolumeByMuscleGroup(sessions, () => "chest");

    expect(result).toEqual([{ weekStart: "2026-01-05", muscleGroup: "chest", effectiveSets: 2, tonnageKg: 1000 }]);
  });

  it("groups by muscle group and skips exercises with no known muscle group", () => {
    const sessions = [
      {
        startTime: new Date("2026-01-07T00:00:00Z"),
        exercises: [
          { exerciseTemplateId: "bench1", sets: [{ type: "normal", weightKg: 100, reps: 5 }] },
          { exerciseTemplateId: "unknown", sets: [{ type: "normal", weightKg: 999, reps: 99 }] },
        ],
      },
    ];

    const result = weeklyVolumeByMuscleGroup(sessions, (id) => (id === "bench1" ? "chest" : null));

    expect(result).toEqual([{ weekStart: "2026-01-05", muscleGroup: "chest", effectiveSets: 1, tonnageKg: 500 }]);
  });
});
