export interface RecordSet {
  weightKg: number | null;
  reps: number | null;
  type: string;
}

export interface DatedSets {
  date: string;
  workoutId: string;
  sets: RecordSet[];
}

export const REP_BRACKETS = [1, 3, 5, 8] as const;
export type RepBracket = (typeof REP_BRACKETS)[number];

export interface RecordEntry {
  bracket: RepBracket;
  weightKg: number;
  reps: number;
  date: string;
  workoutId: string;
}

/**
 * PR per rep bracket: heaviest weight moved for a working (non-warmup) set
 * with at least `bracket` reps. Matches how lifting apps define "5RM" etc. —
 * not a literal max-reps-at-exactly-N set.
 */
export function recordsByBracket(sessions: DatedSets[]): Record<RepBracket, RecordEntry | null> {
  const result: Record<RepBracket, RecordEntry | null> = { 1: null, 3: null, 5: null, 8: null };

  for (const session of sessions) {
    for (const set of session.sets) {
      if (set.type === "warmup" || set.weightKg === null || set.reps === null || set.weightKg <= 0) continue;

      for (const bracket of REP_BRACKETS) {
        if (set.reps < bracket) continue;
        const current = result[bracket];
        if (!current || set.weightKg > current.weightKg) {
          result[bracket] = {
            bracket,
            weightKg: set.weightKg,
            reps: set.reps,
            date: session.date,
            workoutId: session.workoutId,
          };
        }
      }
    }
  }

  return result;
}
