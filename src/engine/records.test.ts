import { describe, expect, it } from "vitest";
import { recordsByBracket } from "./records.js";

describe("recordsByBracket", () => {
  it("finds the heaviest weight moved for at least N reps, per bracket", () => {
    const sessions = [
      {
        date: "2026-01-01",
        workoutId: "w1",
        sets: [
          { type: "warmup", weightKg: 40, reps: 10 }, // excluded: warmup
          { type: "normal", weightKg: 100, reps: 5 },
          { type: "normal", weightKg: 90, reps: 8 },
        ],
      },
      {
        date: "2026-01-08",
        workoutId: "w2",
        sets: [{ type: "normal", weightKg: 105, reps: 3 }],
      },
    ];

    const records = recordsByBracket(sessions);

    // 1RM: heaviest set with >=1 rep -> 105kg (w2), since 105 > 100 and 105 > 90
    expect(records[1]).toMatchObject({ weightKg: 105, reps: 3, workoutId: "w2" });
    // 3RM: heaviest set with >=3 reps -> also 105kg (w2)
    expect(records[3]).toMatchObject({ weightKg: 105, reps: 3, workoutId: "w2" });
    // 5RM: heaviest set with >=5 reps -> 100kg (w1), since w2's set only has 3 reps
    expect(records[5]).toMatchObject({ weightKg: 100, reps: 5, workoutId: "w1" });
    // 8RM: heaviest set with >=8 reps -> 90kg (w1)
    expect(records[8]).toMatchObject({ weightKg: 90, reps: 8, workoutId: "w1" });
  });

  it("returns null for brackets with no qualifying set", () => {
    const sessions = [{ date: "2026-01-01", workoutId: "w1", sets: [{ type: "normal", weightKg: 50, reps: 2 }] }];

    const records = recordsByBracket(sessions);

    expect(records[1]).toMatchObject({ weightKg: 50, reps: 2 });
    expect(records[3]).toBeNull();
    expect(records[5]).toBeNull();
    expect(records[8]).toBeNull();
  });
});
