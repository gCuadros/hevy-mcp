import { describe, expect, it } from "vitest";
import { bodyweightAt, bodyweightSeries, bodyweightTrend, relativeToBodyweight, type BodyweightPoint } from "./bodyweight.js";

describe("bodyweightSeries", () => {
  it("keeps only real weigh-ins and sorts them oldest first", () => {
    const series = bodyweightSeries([
      { date: "2026-03-01", weightKg: 73.5 },
      { date: "2026-01-15", waistCm: 82 },
      { date: "2026-02-01", weightKg: 75 },
      { date: "2026-01-20", weightKg: 0 },
    ]);

    expect(series).toEqual([
      { date: "2026-02-01", weightKg: 75 },
      { date: "2026-03-01", weightKg: 73.5 },
    ]);
  });
});

describe("bodyweightAt", () => {
  const series: BodyweightPoint[] = [
    { date: "2026-01-01", weightKg: 80 },
    { date: "2026-02-01", weightKg: 78 },
    { date: "2026-02-20", weightKg: 77 },
  ];

  it("picks the nearest weigh-in before the date", () => {
    // 2026-02-01 is 2 days back; 2026-01-01 is 33 and 2026-02-20 is 17, both outside the window.
    expect(bodyweightAt(series, "2026-02-03")).toEqual({ weightKg: 78, measuredOn: "2026-02-01", daysAway: 2 });
  });

  it("picks a weigh-in after the date when it is the nearer one", () => {
    // 2026-02-11: 10 days after 02-01, 9 days before 02-20.
    expect(bodyweightAt(series, "2026-02-11")).toEqual({ weightKg: 77, measuredOn: "2026-02-20", daysAway: 9 });
  });

  it("breaks a tie towards the earlier weigh-in", () => {
    const tied: BodyweightPoint[] = [
      { date: "2026-02-01", weightKg: 78 },
      { date: "2026-02-11", weightKg: 77 },
    ];
    // 2026-02-06 is 5 days from each.
    expect(bodyweightAt(tied, "2026-02-06")).toEqual({ weightKg: 78, measuredOn: "2026-02-01", daysAway: 5 });
  });

  it("returns null when the nearest weigh-in is outside the window", () => {
    // 2026 is not a leap year, so 2026-02-20 to 2026-03-20 is 8 + 20 = 28 days.
    expect(bodyweightAt(series, "2026-03-20")).toBeNull();
    expect(bodyweightAt(series, "2026-03-20", 30)).toEqual({ weightKg: 77, measuredOn: "2026-02-20", daysAway: 28 });
  });

  it("returns null with no weigh-ins at all", () => {
    expect(bodyweightAt([], "2026-02-03")).toBeNull();
  });
});

describe("relativeToBodyweight", () => {
  it("expresses a load as a multiple of bodyweight", () => {
    // 125 / 73.5 = 1.70068... -> 1.701
    expect(relativeToBodyweight(125, 73.5)).toBe(1.701);
  });

  it("returns null rather than dividing by a bodyweight of zero", () => {
    expect(relativeToBodyweight(125, 0)).toBeNull();
  });
});

describe("bodyweightTrend", () => {
  const series: BodyweightPoint[] = [
    { date: "2026-01-01", weightKg: 80 },
    { date: "2026-01-15", weightKg: 79 },
    { date: "2026-02-01", weightKg: 78 },
  ];

  it("computes the change between the first and last weigh-in", () => {
    // change -2 kg; -2/80 = -2.5%; span 31 days
    // per week: -2/31*7 = -0.4516 -> -0.45 kg; -2.5/31*7 = -0.5645 -> -0.56 %
    expect(bodyweightTrend(series)).toEqual({
      first: { date: "2026-01-01", weightKg: 80 },
      last: { date: "2026-02-01", weightKg: 78 },
      changeKg: -2,
      changePercent: -2.5,
      spanDays: 31,
      perWeekKg: -0.45,
      perWeekPercent: -0.56,
      sampleCount: 3,
      minKg: 78,
      maxKg: 80,
    });
  });

  it("reports a gain with the same arithmetic", () => {
    // +0.7 kg on 70 kg over exactly one week: 1% and 0.7 kg per week.
    const gaining: BodyweightPoint[] = [
      { date: "2026-01-01", weightKg: 70 },
      { date: "2026-01-08", weightKg: 70.7 },
    ];

    expect(bodyweightTrend(gaining)).toMatchObject({ changeKg: 0.7, changePercent: 1, spanDays: 7, perWeekKg: 0.7, perWeekPercent: 1 });
  });

  it("restricts the trend to the requested range", () => {
    // From 2026-01-15: 79 -> 78 is -1 kg, -1/79 = -1.2658% -> -1.27, over 17 days.
    // per week: -1/17*7 = -0.4118 -> -0.41 kg; -1.2658/17*7 = -0.5212 -> -0.52 %
    expect(bodyweightTrend(series, { from: "2026-01-15" })).toMatchObject({
      changeKg: -1,
      changePercent: -1.27,
      spanDays: 17,
      perWeekKg: -0.41,
      perWeekPercent: -0.52,
      sampleCount: 2,
    });
  });

  it("returns null below two weigh-ins, because one weight is not a trend", () => {
    expect(bodyweightTrend([{ date: "2026-01-01", weightKg: 80 }])).toBeNull();
    expect(bodyweightTrend([])).toBeNull();
    expect(bodyweightTrend(series, { from: "2026-01-20" })).toBeNull();
  });
});
