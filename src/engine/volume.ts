export interface VolumeSet {
  type: string;
  weightKg: number | null;
  reps: number | null;
}

export interface VolumeExercise {
  exerciseTemplateId: string;
  sets: VolumeSet[];
}

export interface VolumeSession {
  startTime: Date;
  exercises: VolumeExercise[];
}

export interface WeeklyMuscleVolume {
  weekStart: string;
  muscleGroup: string;
  effectiveSets: number;
  tonnageKg: number;
}

/** Monday (UTC) of the week containing `date`, as an ISO date string — the week's grouping key. */
export function weekStart(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);
  return utcDate.toISOString().slice(0, 10);
}

/**
 * Effective sets (non-warmup) and tonnage (weight × reps) per muscle group
 * per week. `muscleGroupOf` resolves a template ID using the cached exercise
 * templates — no separately curated dataset needed, Hevy's own
 * `primary_muscle_group` is granular enough for v1.
 */
export function weeklyVolumeByMuscleGroup(
  sessions: VolumeSession[],
  muscleGroupOf: (exerciseTemplateId: string) => string | null,
): WeeklyMuscleVolume[] {
  const buckets = new Map<string, WeeklyMuscleVolume>();

  for (const session of sessions) {
    const week = weekStart(session.startTime);
    for (const exercise of session.exercises) {
      const muscleGroup = muscleGroupOf(exercise.exerciseTemplateId);
      if (!muscleGroup) continue;

      const key = `${week}|${muscleGroup}`;
      const bucket = buckets.get(key) ?? { weekStart: week, muscleGroup, effectiveSets: 0, tonnageKg: 0 };

      for (const set of exercise.sets) {
        if (set.type === "warmup") continue;
        bucket.effectiveSets += 1;
        bucket.tonnageKg += (set.weightKg ?? 0) * (set.reps ?? 0);
      }

      buckets.set(key, bucket);
    }
  }

  return [...buckets.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.muscleGroup.localeCompare(b.muscleGroup));
}
