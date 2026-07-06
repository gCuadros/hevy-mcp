import { describe, expect, it } from "vitest";
import { computeConsistency } from "./consistency.js";

describe("computeConsistency", () => {
  it("returns zeroed report for no workouts", () => {
    expect(computeConsistency([])).toEqual({
      workoutCount: 0,
      weeksSpanned: 0,
      averagePerWeek: 0,
      currentStreakWeeks: 0,
      longestGapDays: 0,
    });
  });

  it("computes average per week and the longest gap across a known date range", () => {
    // Mondays 2026-01-05, 2026-01-12, then a 3-week gap, then 2026-02-02
    const dates = [new Date("2026-01-05T10:00:00Z"), new Date("2026-01-12T10:00:00Z"), new Date("2026-02-02T10:00:00Z")];
    const now = new Date("2026-02-02T10:00:00Z");

    const report = computeConsistency(dates, now);

    expect(report.workoutCount).toBe(3);
    expect(report.weeksSpanned).toBe(5); // 2026-01-05 .. 2026-02-02 inclusive = 5 Mondays
    expect(report.averagePerWeek).toBeCloseTo(3 / 5, 5);
    expect(report.longestGapDays).toBe(21); // 2026-01-12 -> 2026-02-02
  });

  it("counts the current streak of consecutive weeks up to `now`", () => {
    const dates = [new Date("2026-01-05T10:00:00Z"), new Date("2026-01-12T10:00:00Z"), new Date("2026-01-19T10:00:00Z")];
    const now = new Date("2026-01-19T10:00:00Z");

    const report = computeConsistency(dates, now);

    expect(report.currentStreakWeeks).toBe(3);
  });

  it("resets the streak to 0 when the most recent week has no workout", () => {
    const dates = [new Date("2026-01-05T10:00:00Z")];
    const now = new Date("2026-01-19T10:00:00Z"); // two weeks later, no workout that week

    const report = computeConsistency(dates, now);

    expect(report.currentStreakWeeks).toBe(0);
  });
});
