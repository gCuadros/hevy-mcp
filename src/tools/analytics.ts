import { comparePeriods, type PeriodComparison } from "../engine/compare.js";
import { computeConsistency, type ConsistencyReport } from "../engine/consistency.js";
import { bestSetE1rm, type E1rmFormula } from "../engine/e1rm.js";
import { buildMuscleGroupResolver } from "../engine/muscle-map.js";
import { recordsByBracket, type RecordEntry, type RepBracket } from "../engine/records.js";
import { weeklyVolumeByMuscleGroup, type WeeklyMuscleVolume } from "../engine/volume.js";
import { resolveExercise, type ExerciseCandidate, type ReadDeps } from "./read.js";

export type AnalyticsDeps = ReadDeps;

export interface ProgressPoint {
  workoutId: string;
  date: string;
  weightKg: number;
  reps: number;
  e1rm: number;
}

export type GetProgressResult =
  | { status: "resolved"; template: ExerciseCandidate; formula: E1rmFormula; progress: ProgressPoint[] }
  | { status: "ambiguous"; candidates: ExerciseCandidate[] }
  | { status: "not-found" };

/** e1RM trend over time (best set per session) for a given exercise. */
export function getProgress(
  deps: AnalyticsDeps,
  input: { exercise: string; formula?: E1rmFormula | undefined },
): GetProgressResult {
  const resolved = resolveExercise(deps, input.exercise);
  if (resolved.status !== "resolved") return resolved;

  const formula = input.formula ?? "epley";
  const progress: ProgressPoint[] = [];

  for (const workout of deps.store.listWorkouts()) {
    for (const exercise of workout.exercises) {
      if (exercise.exerciseTemplateId !== resolved.template.id) continue;
      const best = bestSetE1rm(exercise.sets, formula);
      if (!best) continue;
      progress.push({
        workoutId: workout.id,
        date: workout.startTime.toISOString(),
        weightKg: best.set.weightKg as number,
        reps: best.set.reps as number,
        e1rm: Math.round(best.e1rm * 10) / 10,
      });
    }
  }

  progress.sort((a, b) => a.date.localeCompare(b.date));
  return {
    status: "resolved",
    template: { id: resolved.template.id, title: resolved.template.title, primaryMuscleGroup: resolved.template.primaryMuscleGroup },
    formula,
    progress,
  };
}

export type GetRecordsResult =
  | { status: "resolved"; template: ExerciseCandidate; records: Record<RepBracket, RecordEntry | null> }
  | { status: "ambiguous"; candidates: ExerciseCandidate[] }
  | { status: "not-found" };

/** PRs per rep bracket (1/3/5/8RM) for a given exercise. */
export function getRecords(deps: AnalyticsDeps, input: { exercise: string }): GetRecordsResult {
  const resolved = resolveExercise(deps, input.exercise);
  if (resolved.status !== "resolved") return resolved;

  const sessions = deps.store
    .listWorkouts()
    .flatMap((workout) =>
      workout.exercises
        .filter((exercise) => exercise.exerciseTemplateId === resolved.template.id)
        .map((exercise) => ({ date: workout.startTime.toISOString(), workoutId: workout.id, sets: exercise.sets })),
    );

  return {
    status: "resolved",
    template: { id: resolved.template.id, title: resolved.template.title, primaryMuscleGroup: resolved.template.primaryMuscleGroup },
    records: recordsByBracket(sessions),
  };
}

export interface GetVolumeReportResult {
  weeks: WeeklyMuscleVolume[];
}

/** Effective sets and tonnage per muscle group per week, across all cached workouts. */
export function getVolumeReport(deps: AnalyticsDeps): GetVolumeReportResult {
  const templates = deps.store.listExerciseTemplates();
  const muscleGroupOf = buildMuscleGroupResolver(templates);
  const sessions = deps.store.listWorkouts().map((workout) => ({ startTime: workout.startTime, exercises: workout.exercises }));

  return { weeks: weeklyVolumeByMuscleGroup(sessions, muscleGroupOf) };
}

/** Frequency, current streak and longest gap across all cached workouts. */
export function getConsistency(deps: AnalyticsDeps): ConsistencyReport {
  return computeConsistency(deps.store.listWorkouts().map((workout) => workout.startTime));
}

/** Volume/workout-count diff between a period and the immediately preceding period of equal length. */
export function comparePeriodsTool(deps: AnalyticsDeps, input: { from: string; to: string }): PeriodComparison {
  const sessions = deps.store.listWorkouts().map((workout) => ({ startTime: workout.startTime, exercises: workout.exercises }));
  return comparePeriods(sessions, new Date(input.from), new Date(input.to));
}
