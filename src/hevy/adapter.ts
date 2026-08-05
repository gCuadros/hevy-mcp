import type {
  BodyMeasurement,
  ExerciseHistoryRow,
  ExerciseTemplate,
  Routine,
  RoutineFolder,
  Set as HevySet,
  Workout,
  WorkoutExercise,
} from "./schemas.js";
import type {
  DomainBodyMeasurement,
  DomainExercise,
  DomainExerciseSession,
  DomainExerciseTemplate,
  DomainHistorySet,
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

/**
 * Rebuilds sessions out of the flat rows /v1/exercise_history/{id} returns, oldest first.
 * Callers that display history reverse it; the analytics read it in this order.
 *
 * Two things the workouts endpoint gives and this one does not. There is no set index, so
 * `order` is the position the rows arrived in — which is the logged order in practice, but
 * it is derived, and it is named `order` rather than `index` so nothing downstream mistakes
 * it for something Hevy asserted. And duplicate sets cannot be collapsed the way `cleanSets`
 * does for workouts: without an index, three identical rows are indistinguishable from one
 * set logged three times, and three sets of 70x6 is the far likelier reading. Empty rows are
 * still dropped, on the same rule as everywhere else — absence beats a zero nobody lifted.
 */
export function toDomainExerciseSessions(rows: ExerciseHistoryRow[]): DomainExerciseSession[] {
  const sessions = new Map<string, DomainExerciseSession>();

  for (const row of rows) {
    if (row.reps === null && row.weight_kg === null && row.distance_meters === null && row.duration_seconds === null) continue;

    let session = sessions.get(row.workout_id);
    if (!session) {
      const context = `exercise history for workout ${row.workout_id}`;
      session = {
        workoutId: row.workout_id,
        workoutTitle: row.workout_title,
        startTime: parseDate(row.workout_start_time, context),
        endTime: parseDate(row.workout_end_time, context),
        sets: [],
      };
      sessions.set(row.workout_id, session);
    }

    session.sets.push(toDomainHistorySet(row, session.sets.length));
  }

  return [...sessions.values()].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

function toDomainHistorySet(row: ExerciseHistoryRow, order: number): DomainHistorySet {
  return {
    order,
    type: row.set_type,
    weightKg: row.weight_kg,
    reps: row.reps,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    rpe: row.rpe,
    customMetric: row.custom_metric,
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

/**
 * Drops every metric Hevy left out or sent as null, so a `weightKg` that is present is
 * always a real measurement. `id` and `created_at` are deliberately not carried across:
 * nothing downstream addresses an entry by anything but its date.
 */
export function toDomainBodyMeasurement(dto: BodyMeasurement): DomainBodyMeasurement {
  const measurement: DomainBodyMeasurement = { date: dto.date };
  const metrics = {
    weightKg: dto.weight_kg,
    leanMassKg: dto.lean_mass_kg,
    fatPercent: dto.fat_percent,
    neckCm: dto.neck_cm,
    shoulderCm: dto.shoulder_cm,
    chestCm: dto.chest_cm,
    leftBicepCm: dto.left_bicep_cm,
    rightBicepCm: dto.right_bicep_cm,
    leftForearmCm: dto.left_forearm_cm,
    rightForearmCm: dto.right_forearm_cm,
    abdomenCm: dto.abdomen,
    waistCm: dto.waist,
    hipsCm: dto.hips,
    leftThighCm: dto.left_thigh,
    rightThighCm: dto.right_thigh,
    leftCalfCm: dto.left_calf,
    rightCalfCm: dto.right_calf,
  };

  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === "number") measurement[key as keyof typeof metrics] = value;
  }

  return measurement;
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
