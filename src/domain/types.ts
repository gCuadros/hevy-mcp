export type SetType = "warmup" | "normal" | "failure" | "dropset";

export interface DomainSet {
  index: number;
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: number | null;
}

/**
 * A set as the exercise-history endpoint reports it. Deliberately not a `DomainSet`: that
 * one carries Hevy's own `index`, and this endpoint sends none, so `order` is the row
 * position and nothing more. Two different names for two different guarantees.
 */
export interface DomainHistorySet {
  /** Position within the session, derived from the order the rows arrived in. Not an index Hevy reported. */
  order: number;
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  customMetric: number | null;
}

/** Every set of one exercise in one workout, grouped back out of the flat history rows. */
export interface DomainExerciseSession {
  workoutId: string;
  workoutTitle: string;
  startTime: Date;
  endTime: Date;
  sets: DomainHistorySet[];
}

export interface DomainExercise {
  index: number;
  title: string;
  exerciseTemplateId: string;
  supersetId: number | null;
  notes: string | null;
  sets: DomainSet[];
}

export interface DomainWorkout {
  id: string;
  title: string;
  routineId: string | null;
  description: string | null;
  startTime: Date;
  endTime: Date;
  updatedAt: Date;
  createdAt: Date;
  exercises: DomainExercise[];
}

export interface DomainRoutine {
  id: string;
  title: string;
  folderId: number | null;
  updatedAt: Date;
  createdAt: Date;
  exercises: DomainExercise[];
}

export interface DomainRoutineFolder {
  id: number;
  index: number;
  title: string;
  updatedAt: Date;
  createdAt: Date;
}

/**
 * One day's body measurements. Every metric is optional because Hevy omits the
 * fields that were never filled in rather than sending them as null, so "absent"
 * and "zero" are genuinely different things and must not be collapsed.
 *
 * `date` is a plain YYYY-MM-DD string, not a Date: it is the identity of the entry
 * in Hevy's API (the PUT path is the date) and it carries no time or zone. Turning
 * it into a Date would invent a midnight in some timezone and risk writing to the
 * wrong day.
 */
export interface DomainBodyMeasurement {
  date: string;
  weightKg?: number | undefined;
  leanMassKg?: number | undefined;
  fatPercent?: number | undefined;
  neckCm?: number | undefined;
  shoulderCm?: number | undefined;
  chestCm?: number | undefined;
  leftBicepCm?: number | undefined;
  rightBicepCm?: number | undefined;
  leftForearmCm?: number | undefined;
  rightForearmCm?: number | undefined;
  abdomenCm?: number | undefined;
  waistCm?: number | undefined;
  hipsCm?: number | undefined;
  leftThighCm?: number | undefined;
  rightThighCm?: number | undefined;
  leftCalfCm?: number | undefined;
  rightCalfCm?: number | undefined;
}

export interface DomainExerciseTemplate {
  id: string;
  title: string;
  type: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string | null;
  isCustom: boolean;
}
