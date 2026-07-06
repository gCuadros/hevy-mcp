import type { Store } from "./store/db.js";

export interface ResourceDeps {
  store: Store;
}

/**
 * hevy:// resources: cheap, cache-only snapshots for a client to read without
 * a tool call. None returns full history — that's what filtered tools are for.
 */
export function buildResources(deps: ResourceDeps) {
  const workouts = deps.store.listWorkouts();
  const routines = deps.store.listRoutines();
  const exerciseTemplates = deps.store.listExerciseTemplates();

  const profile = {
    cachedWorkoutCount: workouts.length,
    firstWorkoutAt: workouts[0]?.startTime.toISOString() ?? null,
    lastWorkoutAt: workouts.at(-1)?.startTime.toISOString() ?? null,
    lastSyncedAt: deps.store.getSyncState("last_synced_at"),
  };

  const routinesSummary = routines.map((routine) => ({
    id: routine.id,
    title: routine.title,
    folderId: routine.folderId,
    exerciseCount: routine.exercises.length,
  }));

  const exercisesSummary = exerciseTemplates.map((template) => ({
    id: template.id,
    title: template.title,
    primaryMuscleGroup: template.primaryMuscleGroup,
  }));

  const statsSummary = {
    cachedWorkoutCount: workouts.length,
    cachedRoutineCount: routines.length,
    cachedExerciseTemplateCount: exerciseTemplates.length,
  };

  const recentWorkouts = workouts
    .slice(-10)
    .reverse()
    .map((workout) => ({
      id: workout.id,
      title: workout.title,
      startTime: workout.startTime.toISOString(),
      exerciseCount: workout.exercises.length,
    }));

  return { profile, routines: routinesSummary, exercises: exercisesSummary, statsSummary, recentWorkouts };
}
