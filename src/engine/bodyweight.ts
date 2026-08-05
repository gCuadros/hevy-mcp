import type { DomainBodyMeasurement } from "../domain/types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far from a session a weigh-in may sit and still describe it. Bodyweight moves
 * slowly, so a fortnight is close enough to be honest; beyond that a cut or a bulk has
 * had time to move the number enough that the ratio would be fiction.
 */
export const DEFAULT_WINDOW_DAYS = 14;

export interface BodyweightSample {
  weightKg: number;
  /** The day the weigh-in was logged, YYYY-MM-DD. Compare it with the date asked about to see which came first. */
  measuredOn: string;
  /** Distance between the two dates in whole days, never negative. Zero means the weigh-in is from that same day. */
  daysAway: number;
}

export interface BodyweightPoint {
  date: string;
  weightKg: number;
}

export interface BodyweightTrend {
  first: BodyweightPoint;
  last: BodyweightPoint;
  changeKg: number;
  changePercent: number;
  spanDays: number;
  /** Simple linear rate over the whole span, not a fit and not compounded. */
  perWeekKg: number;
  perWeekPercent: number;
  /** Weigh-ins the trend was computed from, after any date filtering. */
  sampleCount: number;
  /** Lightest and heaviest inside the range, which a first/last pair alone hides. */
  minKg: number;
  maxKg: number;
}

/**
 * Weigh-ins only, oldest first. An entry that recorded a waist measurement and no
 * weight is not a weigh-in, and dropping it here keeps every caller from re-checking.
 *
 * Zero is excluded here, unlike everywhere else in this codebase where a zero survives:
 * nobody weighs nothing, so it can only be a mistyped entry — and it would divide the
 * percentage change by zero.
 *
 * Dates are compared as strings throughout this module: Hevy stores a plain YYYY-MM-DD
 * with no time or zone, and that format sorts and ranges correctly on its own.
 */
export function bodyweightSeries(measurements: DomainBodyMeasurement[]): BodyweightPoint[] {
  return measurements
    .filter((entry): entry is DomainBodyMeasurement & { weightKg: number } => typeof entry.weightKg === "number" && entry.weightKg > 0)
    .map((entry) => ({ date: entry.date, weightKg: entry.weightKg }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The weigh-in that best describes a given day: the nearest one in either direction,
 * inside `windowDays`.
 *
 * Looking forward as well as back is deliberate. Someone who weighs in monthly has
 * sessions that no earlier weigh-in covers at all, and a weigh-in three days after a
 * lift describes the body that lifted it better than one from three weeks before. Ties
 * go to the earlier weigh-in, which is the weight actually carried into the session.
 */
export function bodyweightAt(
  series: BodyweightPoint[],
  date: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): BodyweightSample | null {
  let best: BodyweightSample | null = null;

  for (const point of series) {
    const daysAway = Math.abs(daysBetween(point.date, date));
    // A date this cannot parse gives NaN, and every comparison below it is false — so
    // without this the window check fails *open* and an arbitrarily distant weigh-in gets
    // attached to the session. Skipping is the only safe reading of "distance unknown".
    if (!Number.isFinite(daysAway) || daysAway > windowDays) continue;
    // Strictly closer only, so the first match at a given distance wins — and the series
    // is sorted oldest first, which is what makes ties resolve to the earlier weigh-in.
    if (best && daysAway >= best.daysAway) continue;
    best = { weightKg: point.weightKg, measuredOn: point.date, daysAway };
  }

  return best;
}

/**
 * A load as a multiple of bodyweight. Three decimals because two would round a 2.5 kg
 * jump on a 100 kg lifter down to nothing, and a flat ratio is exactly what someone
 * tracking strength through a cut is watching.
 */
export function relativeToBodyweight(loadKg: number, bodyweightKg: number): number | null {
  if (bodyweightKg <= 0) return null;
  return Math.round((loadKg / bodyweightKg) * 1000) / 1000;
}

/**
 * Change between the first and last weigh-in of a range. Returns null below two
 * weigh-ins: one point is a weight, not a trend, and reporting a rate of zero from it
 * would be a claim nobody made.
 *
 * Rounding to two decimals happens here rather than in the caller because every field
 * is kilos or percent, where the third decimal is past what a bathroom scale resolves.
 */
export function bodyweightTrend(
  series: BodyweightPoint[],
  range: { from?: string | undefined; to?: string | undefined } = {},
): BodyweightTrend | null {
  const inRange = series.filter((point) => (!range.from || point.date >= range.from) && (!range.to || point.date <= range.to));
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  if (!first || !last || inRange.length < 2) return null;

  const changeKg = last.weightKg - first.weightKg;
  const spanDays = daysBetween(last.date, first.date);
  const weights = inRange.map((point) => point.weightKg);

  return {
    first,
    last,
    changeKg: round2(changeKg),
    changePercent: round2((changeKg / first.weightKg) * 100),
    spanDays,
    // spanDays cannot be zero here: Hevy stores one entry per date, so two entries are
    // two different days. Guarded anyway rather than emitting an Infinity.
    perWeekKg: spanDays > 0 ? round2((changeKg / spanDays) * 7) : 0,
    perWeekPercent: spanDays > 0 ? round2((changeKg / first.weightKg / spanDays) * 100 * 7) : 0,
    sampleCount: inRange.length,
    minKg: Math.min(...weights),
    maxKg: Math.max(...weights),
  };
}

/** Whole days between two YYYY-MM-DD dates, parsed at UTC midnight so no zone can shift the result. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00.000Z`) - Date.parse(`${b}T00:00:00.000Z`)) / MS_PER_DAY);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
