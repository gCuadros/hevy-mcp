import { weekStart } from "./volume.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ConsistencyReport {
  workoutCount: number;
  weeksSpanned: number;
  averagePerWeek: number;
  /** Consecutive weeks (up to the most recent) with at least one workout. */
  currentStreakWeeks: number;
  /** The longest gap between two consecutive workouts, in days. */
  longestGapDays: number;
}

/**
 * Frequency, streaks and gaps over a set of workout dates. Weeks are Monday
 * -> Sunday, consistent with volume.ts's weekStart grouping.
 */
export function computeConsistency(startTimes: Date[], now: Date = new Date()): ConsistencyReport {
  if (startTimes.length === 0) {
    return { workoutCount: 0, weeksSpanned: 0, averagePerWeek: 0, currentStreakWeeks: 0, longestGapDays: 0 };
  }

  const sorted = [...startTimes].sort((a, b) => a.getTime() - b.getTime());
  const weeksWithWorkout = new Set(sorted.map((date) => weekStart(date)));

  const first = sorted[0] as Date;
  const weeksSpanned = Math.max(1, Math.round((weekStartMs(now) - weekStartMs(first)) / (7 * MS_PER_DAY)) + 1);
  const averagePerWeek = sorted.length / weeksSpanned;

  let longestGapDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1] as Date;
    const curr = sorted[i] as Date;
    const gapDays = Math.round((curr.getTime() - prev.getTime()) / MS_PER_DAY);
    if (gapDays > longestGapDays) longestGapDays = gapDays;
  }

  let currentStreakWeeks = 0;
  let cursor = weekStartMs(now);
  while (weeksWithWorkout.has(new Date(cursor).toISOString().slice(0, 10))) {
    currentStreakWeeks += 1;
    cursor -= 7 * MS_PER_DAY;
  }

  return { workoutCount: sorted.length, weeksSpanned, averagePerWeek, currentStreakWeeks, longestGapDays };
}

function weekStartMs(date: Date): number {
  return new Date(`${weekStart(date)}T00:00:00.000Z`).getTime();
}
