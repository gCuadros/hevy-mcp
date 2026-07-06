export interface PeriodSet {
  type: string;
  weightKg: number | null;
  reps: number | null;
}

export interface PeriodSession {
  startTime: Date;
  exercises: { sets: PeriodSet[] }[];
}

export interface PeriodStats {
  workoutCount: number;
  effectiveSets: number;
  tonnageKg: number;
}

export interface PeriodComparison {
  current: PeriodStats;
  previous: PeriodStats;
  delta: PeriodStats;
}

function statsFor(sessions: PeriodSession[], from: Date, to: Date): PeriodStats {
  const inRange = sessions.filter((s) => s.startTime >= from && s.startTime <= to);
  let effectiveSets = 0;
  let tonnageKg = 0;
  for (const session of inRange) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.type === "warmup") continue;
        effectiveSets += 1;
        tonnageKg += (set.weightKg ?? 0) * (set.reps ?? 0);
      }
    }
  }
  return { workoutCount: inRange.length, effectiveSets, tonnageKg };
}

function delta(current: PeriodStats, previous: PeriodStats): PeriodStats {
  return {
    workoutCount: current.workoutCount - previous.workoutCount,
    effectiveSets: current.effectiveSets - previous.effectiveSets,
    tonnageKg: current.tonnageKg - previous.tonnageKg,
  };
}

/** Compares workout/volume stats between a period and the immediately preceding period of equal length. */
export function comparePeriods(sessions: PeriodSession[], from: Date, to: Date): PeriodComparison {
  const durationMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  const current = statsFor(sessions, from, to);
  const previous = statsFor(sessions, previousFrom, previousTo);

  return { current, previous, delta: delta(current, previous) };
}
