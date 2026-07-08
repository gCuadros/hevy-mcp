import type { HevyClient } from "./hevy/client.js";
import { fetchAllExerciseTemplates, fetchAllRoutines, fetchAllWorkouts } from "./hevy/fetchAll.js";

export interface ResourceDeps {
  client: HevyClient;
}

/**
 * hevy:// resources: cheap, live snapshots for a client to read without a
 * tool call. None returns full history — that's what filtered tools are for.
 */
export async function buildResources(deps: ResourceDeps) {
  const workouts = await fetchAllWorkouts(deps.client);
  const routines = await fetchAllRoutines(deps.client);
  const exerciseTemplates = await fetchAllExerciseTemplates(deps.client);

  const profile = {
    workoutCount: workouts.length,
    firstWorkoutAt: workouts[0]?.startTime.toISOString() ?? null,
    lastWorkoutAt: workouts.at(-1)?.startTime.toISOString() ?? null,
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
    workoutCount: workouts.length,
    routineCount: routines.length,
    exerciseTemplateCount: exerciseTemplates.length,
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
