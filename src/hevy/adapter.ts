import type {
  ExerciseTemplate,
  Routine,
  RoutineFolder,
  Set as HevySet,
  Workout,
  WorkoutExercise,
} from "./schemas.js";
import type {
  DomainExercise,
  DomainExerciseTemplate,
  DomainRoutine,
  DomainRoutineFolder,
  DomainSet,
  DomainWorkout,
} from "../domain/types.js";

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}

function parseDate(value: string, context: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AdapterError(`Invalid date "${value}" in ${context}`);
  }
  return date;
}

function isMeaningfulSet(set: HevySet): boolean {
  return set.reps !== null || set.weight_kg !== null || set.distance_meters !== null || set.duration_seconds !== null;
}

function toDomainSet(dto: HevySet): DomainSet {
  return {
    index: dto.index,
    type: dto.type,
    weightKg: dto.weight_kg,
    reps: dto.reps,
    distanceMeters: dto.distance_meters,
    durationSeconds: dto.duration_seconds,
    rpe: dto.rpe,
  };
}

/**
 * Drops empty/junk sets and collapses duplicate indices (keeping the last
 * occurrence), then re-sorts by index. Handles the dirty data Hevy
 * occasionally returns for in-progress or edited workouts.
 */
function cleanSets(sets: HevySet[]): DomainSet[] {
  const byIndex = new Map<number, HevySet>();
  for (const set of sets) {
    if (isMeaningfulSet(set)) {
      byIndex.set(set.index, set);
    }
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index).map(toDomainSet);
}

function toDomainExercise(dto: WorkoutExercise, context: string): DomainExercise {
  return {
    index: dto.index,
    title: dto.title,
    exerciseTemplateId: dto.exercise_template_id,
    supersetId: dto.superset_id,
    notes: dto.notes,
    sets: cleanSets(dto.sets),
  };
}

export function toDomainWorkout(dto: Workout): DomainWorkout {
  const context = `workout ${dto.id}`;
  return {
    id: dto.id,
    title: dto.title,
    routineId: dto.routine_id,
    description: dto.description,
    startTime: parseDate(dto.start_time, context),
    endTime: parseDate(dto.end_time, context),
    updatedAt: parseDate(dto.updated_at, context),
    createdAt: parseDate(dto.created_at, context),
    exercises: dto.exercises.map((exercise) => toDomainExercise(exercise, context)),
  };
}

export function toDomainRoutine(dto: Routine): DomainRoutine {
  const context = `routine ${dto.id}`;
  return {
    id: dto.id,
    title: dto.title,
    folderId: dto.folder_id,
    updatedAt: parseDate(dto.updated_at, context),
    createdAt: parseDate(dto.created_at, context),
    exercises: dto.exercises.map((exercise) => ({
      index: exercise.index,
      title: exercise.title,
      exerciseTemplateId: exercise.exercise_template_id,
      supersetId: exercise.superset_id,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        index: set.index,
        type: set.type,
        weightKg: set.weight_kg,
        reps: set.reps,
        distanceMeters: set.distance_meters,
        durationSeconds: set.duration_seconds,
        rpe: set.rpe,
      })),
    })),
  };
}

export function toDomainRoutineFolder(dto: RoutineFolder): DomainRoutineFolder {
  const context = `routine folder ${dto.id}`;
  return {
    id: dto.id,
    index: dto.index,
    title: dto.title,
    updatedAt: parseDate(dto.updated_at, context),
    createdAt: parseDate(dto.created_at, context),
  };
}

export function toDomainExerciseTemplate(dto: ExerciseTemplate): DomainExerciseTemplate {
  return {
    id: dto.id,
    title: dto.title,
    type: dto.type,
    primaryMuscleGroup: dto.primary_muscle_group,
    secondaryMuscleGroups: dto.secondary_muscle_groups,
    equipment: dto.equipment,
    isCustom: dto.is_custom,
  };
}
