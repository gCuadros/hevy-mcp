import {
  bodyweightAt,
  bodyweightSeries,
  bodyweightTrend,
  relativeToBodyweight,
  type BodyweightPoint,
  type BodyweightTrend,
} from "../engine/bodyweight.js";
import { comparePeriods, type PeriodComparison } from "../engine/compare.js";
import { computeConsistency, type ConsistencyReport } from "../engine/consistency.js";
import { bestSetE1rm, type E1rmFormula } from "../engine/e1rm.js";
import { buildMuscleGroupResolver } from "../engine/muscle-map.js";
import { recordsByBracket, type RecordEntry, type RepBracket } from "../engine/records.js";
import { weeklyVolumeByMuscleGroup, type WeeklyMuscleVolume } from "../engine/volume.js";
import { fetchAllBodyMeasurements, fetchAllExerciseTemplates, fetchAllWorkouts } from "../hevy/fetchAll.js";
import { resolveExercise, type ExerciseCandidate, type ReadDeps } from "./read.js";

export type AnalyticsDeps = ReadDeps;

export interface ProgressPoint {
  workoutId: string;
  date: string;
  weightKg: number;
  reps: number;
  e1rm: number;
  /** Only present when relativeToBodyweight was asked for and a weigh-in sits near the session. */
  bodyweightKg?: number;
  bodyweightMeasuredOn?: string;
  /** e1RM as a multiple of the bodyweight above. */
  relativeE1rm?: number;
}

/** How many sessions in a progress series could be matched to a weigh-in, so partial coverage is visible rather than implied. */
export interface BodyweightCoverage {
  sessionsWithBodyweight: number;
  sessionsTotal: number;
  weighInsFound: number;
}

export interface ProgressReport {
  status: "resolved";
  template: ExerciseCandidate;
  formula: E1rmFormula;
  progress: ProgressPoint[];
  bodyweightCoverage?: BodyweightCoverage;
}

export type GetProgressResult = ProgressReport | { status: "ambiguous"; candidates: ExerciseCandidate[] } | { status: "not-found" };

/** e1RM trend over time (best set per session) for a given exercise, optionally expressed relative to bodyweight. */
export async function getProgress(
  deps: AnalyticsDeps,
  input: { exercise: string; formula?: E1rmFormula | undefined; relativeToBodyweight?: boolean | undefined },
): Promise<GetProgressResult> {
  const resolved = await resolveExercise(deps, input.exercise);
  if (resolved.status !== "resolved") return resolved;

  const formula = input.formula ?? "epley";
  const progress: ProgressPoint[] = [];

  const workouts = await fetchAllWorkouts(deps.client);
  for (const workout of workouts) {
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
  const result: ProgressReport = {
    status: "resolved",
    template: { id: resolved.template.id, title: resolved.template.title, primaryMuscleGroup: resolved.template.primaryMuscleGroup },
    formula,
    progress,
  };

  // Opt-in, because measurements paginate ten to a page: someone who weighs in daily
  // would pay a second full walk of the API on every progress question that never
  // mentioned bodyweight.
  if (input.relativeToBodyweight) {
    const series = bodyweightSeries(await fetchAllBodyMeasurements(deps.client));
    let matched = 0;
    for (const point of progress) {
      const sample = bodyweightAt(series, point.date.slice(0, 10));
      if (!sample) continue;
      const relative = relativeToBodyweight(point.e1rm, sample.weightKg);
      if (relative === null) continue;
      point.bodyweightKg = sample.weightKg;
      point.bodyweightMeasuredOn = sample.measuredOn;
      point.relativeE1rm = relative;
      matched += 1;
    }
    result.bodyweightCoverage = { sessionsWithBodyweight: matched, sessionsTotal: progress.length, weighInsFound: series.length };
  }

  return result;
}

export interface GetBodyweightTrendResult {
  trend: BodyweightTrend | null;
  /** Every weigh-in in the range, oldest first, so the model can see the shape and not just the endpoints. */
  series: BodyweightPoint[];
}

/** Bodyweight change over a date range: total, percentage and weekly rate. */
export async function getBodyweightTrend(
  deps: AnalyticsDeps,
  input: { from?: string | undefined; to?: string | undefined } = {},
): Promise<GetBodyweightTrendResult> {
  const series = bodyweightSeries(await fetchAllBodyMeasurements(deps.client));
  const inRange = series.filter((point) => (!input.from || point.date >= input.from) && (!input.to || point.date <= input.to));
  return { trend: bodyweightTrend(series, input), series: inRange };
}

export type GetRecordsResult =
  | { status: "resolved"; template: ExerciseCandidate; records: Record<RepBracket, RecordEntry | null> }
  | { status: "ambiguous"; candidates: ExerciseCandidate[] }
  | { status: "not-found" };

/** PRs per rep bracket (1/3/5/8RM) for a given exercise. */
export async function getRecords(deps: AnalyticsDeps, input: { exercise: string }): Promise<GetRecordsResult> {
  const resolved = await resolveExercise(deps, input.exercise);
  if (resolved.status !== "resolved") return resolved;

  const workouts = await fetchAllWorkouts(deps.client);
  const sessions = workouts.flatMap((workout) =>
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

/** Effective sets and tonnage per muscle group per week, across all workouts. */
export async function getVolumeReport(deps: AnalyticsDeps): Promise<GetVolumeReportResult> {
  const templates = await fetchAllExerciseTemplates(deps.client);
  const muscleGroupOf = buildMuscleGroupResolver(templates);
  const workouts = await fetchAllWorkouts(deps.client);
  const sessions = workouts.map((workout) => ({ startTime: workout.startTime, exercises: workout.exercises }));

  return { weeks: weeklyVolumeByMuscleGroup(sessions, muscleGroupOf) };
}

/** Frequency, current streak and longest gap across all workouts. */
export async function getConsistency(deps: AnalyticsDeps): Promise<ConsistencyReport> {
  const workouts = await fetchAllWorkouts(deps.client);
  return computeConsistency(workouts.map((workout) => workout.startTime));
}

/** Volume/workout-count diff between a period and the immediately preceding period of equal length. */
export async function comparePeriodsTool(deps: AnalyticsDeps, input: { from: string; to: string }): Promise<PeriodComparison> {
  const workouts = await fetchAllWorkouts(deps.client);
  const sessions = workouts.map((workout) => ({ startTime: workout.startTime, exercises: workout.exercises }));
  return comparePeriods(sessions, new Date(input.from), new Date(input.to));
}
