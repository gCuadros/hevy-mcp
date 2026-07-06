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

export interface DomainExerciseTemplate {
  id: string;
  title: string;
  type: string;
  primaryMuscleGroup: string;
  secondaryMuscleGroups: string[];
  equipment: string | null;
  isCustom: boolean;
}
