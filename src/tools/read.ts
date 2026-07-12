import { toDomainWorkout } from "../hevy/adapter.js";
import type { HevyClient } from "../hevy/client.js";
import { fetchAllExerciseTemplates, fetchAllRoutines, fetchAllWorkouts } from "../hevy/fetchAll.js";
import type { DomainExerciseTemplate, DomainRoutine, DomainWorkout } from "../domain/types.js";

export interface ReadDeps {
  client: HevyClient;
}

function summarizeWorkout(workout: DomainWorkout) {
  const setCount = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  return {
    id: workout.id,
    title: workout.title,
    startTime: workout.startTime.toISOString(),
    endTime: workout.endTime.toISOString(),
    exerciseCount: workout.exercises.length,
    setCount,
  };
}

export interface GetWorkoutsInput {
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
}

export async function getWorkouts(deps: ReadDeps, input: GetWorkoutsInput = {}) {
  const from = input.from ? new Date(input.from) : null;
  const to = input.to ? new Date(input.to) : null;
  const limit = input.limit ?? 20;

  const allWorkouts = await fetchAllWorkouts(deps.client);
  const workouts = allWorkouts
    .filter((workout) => (!from || workout.startTime >= from) && (!to || workout.startTime <= to))
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, limit);

  return { workouts: workouts.map(summarizeWorkout) };
}

export async function getWorkout(deps: ReadDeps, input: { id: string }): Promise<DomainWorkout | null> {
  try {
    return toDomainWorkout(await deps.client.getWorkout(input.id));
  } catch {
    return null;
  }
}

function summarizeRoutine(routine: DomainRoutine) {
  return { id: routine.id, title: routine.title, folderId: routine.folderId, exerciseCount: routine.exercises.length };
}

export async function listRoutines(deps: ReadDeps) {
  const routines = await fetchAllRoutines(deps.client);
  return { routines: routines.map(summarizeRoutine) };
}

export async function getRoutine(deps: ReadDeps, input: { id: string }): Promise<DomainRoutine | null> {
  const routines = await fetchAllRoutines(deps.client);
  return routines.find((routine) => routine.id === input.id) ?? null;
}

export interface ExerciseCandidate {
  id: string;
  title: string;
  primaryMuscleGroup: string;
}

function toCandidate(template: DomainExerciseTemplate): ExerciseCandidate {
  return { id: template.id, title: template.title, primaryMuscleGroup: template.primaryMuscleGroup };
}

export async function searchExercises(deps: ReadDeps, input: { query: string }) {
  const templates = await fetchAllExerciseTemplates(deps.client);

  const exactId = templates.find((template) => template.id === input.query);
  if (exactId) return { matches: [toCandidate(exactId)] };

  const query = input.query.trim().toLowerCase();
  const matches = templates.filter((template) => template.title.toLowerCase().includes(query));
  return { matches: matches.map(toCandidate) };
}

export type ResolveExerciseResult =
  | { status: "resolved"; template: DomainExerciseTemplate }
  | { status: "ambiguous"; candidates: ExerciseCandidate[] }
  | { status: "not-found" };

/**
 * Resolves a human exercise name or a template ID to a single template.
 * Per contract #3: never guesses on ambiguity — callers get the candidate
 * list back and must disambiguate.
 */
export async function resolveExercise(deps: ReadDeps, ref: string): Promise<ResolveExerciseResult> {
  const templates = await fetchAllExerciseTemplates(deps.client);

  const byId = templates.find((template) => template.id === ref);
  if (byId) return { status: "resolved", template: byId };

  const query = ref.trim().toLowerCase();
  const exactTitleMatches = templates.filter((template) => template.title.toLowerCase() === query);
  if (exactTitleMatches.length === 1 && exactTitleMatches[0]) {
    return { status: "resolved", template: exactTitleMatches[0] };
  }

  const partialMatches = templates.filter((template) => template.title.toLowerCase().includes(query));
  if (partialMatches.length === 1 && partialMatches[0]) return { status: "resolved", template: partialMatches[0] };
  if (partialMatches.length > 1) return { status: "ambiguous", candidates: partialMatches.map(toCandidate) };

  return { status: "not-found" };
}

export interface ExerciseHistoryEntry {
  workoutId: string;
  date: string;
  sets: { index: number; weightKg: number | null; reps: number | null; rpe: number | null }[];
}

export type GetExerciseHistoryResult =
  | { status: "resolved"; template: ExerciseCandidate; history: ExerciseHistoryEntry[] }
  | { status: "ambiguous"; candidates: ExerciseCandidate[] }
  | { status: "not-found" };

export async function getExerciseHistory(
  deps: ReadDeps,
  input: { exercise: string; limit?: number | undefined },
): Promise<GetExerciseHistoryResult> {
  const resolved = await resolveExercise(deps, input.exercise);
  if (resolved.status !== "resolved") return resolved;

  const limit = input.limit ?? 20;
  const allWorkouts = await fetchAllWorkouts(deps.client);
  const history = allWorkouts
    .flatMap((workout) =>
      workout.exercises
        .filter((exercise) => exercise.exerciseTemplateId === resolved.template.id)
        .map((exercise) => ({
          workoutId: workout.id,
          date: workout.startTime.toISOString(),
          sets: exercise.sets.map((set) => ({ index: set.index, weightKg: set.weightKg, reps: set.reps, rpe: set.rpe })),
        })),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);

  return { status: "resolved", template: toCandidate(resolved.template), history };
}
