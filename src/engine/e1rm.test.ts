import { describe, expect, it } from "vitest";
import { bestSetE1rm, brzycki1Rm, epley1Rm } from "./e1rm.js";

describe("epley1Rm", () => {
  it("matches the manual formula: weight × (1 + reps/30)", () => {
    // 100 × (1 + 5/30) = 100 × 1.1666... = 116.666...
    expect(epley1Rm(100, 5)).toBeCloseTo(116.67, 1);
  });
});

describe("brzycki1Rm", () => {
  it("matches the manual formula: weight × 36 / (37 - reps)", () => {
    // 100 × 36/32 = 112.5
    expect(brzycki1Rm(100, 5)).toBeCloseTo(112.5, 2);
  });
});

describe("bestSetE1rm", () => {
  it("picks the set with the highest estimated 1RM, ignoring bodyweight/incomplete sets", () => {
    const sets = [
      { weightKg: 100, reps: 5 }, // e1rm 116.67
      { weightKg: 110, reps: 2 }, // e1rm 117.33 <- highest
      { weightKg: null, reps: 8 }, // not scoreable
      { weightKg: 0, reps: 20 }, // not scoreable (bodyweight, weight 0)
    ];

    const best = bestSetE1rm(sets);

    expect(best?.set).toEqual({ weightKg: 110, reps: 2 });
    expect(best?.e1rm).toBeCloseTo(117.33, 1);
  });

  it("returns null when no set is scoreable", () => {
    expect(bestSetE1rm([{ weightKg: null, reps: null }])).toBeNull();
  });
});
