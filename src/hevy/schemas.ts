import { z } from "zod";

/**
 * Schemas for the Hevy public API (https://api.hevyapp.com/v1).
 * Shapes are based on the published API docs; not yet validated against a
 * real account (pending HEVY_API_KEY) — see docs/CONNECTOR.md once written.
 */

export const setSchema = z.object({
  index: z.number().int(),
  type: z.enum(["warmup", "normal", "failure", "dropset"]),
  weight_kg: z.number().nullable(),
  reps: z.number().int().nullable(),
  distance_meters: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  rpe: z.number().nullable(),
  custom_metric: z.number().nullable(),
});

export const workoutExerciseSchema = z.object({
  index: z.number().int(),
  title: z.string(),
  notes: z.string().nullable(),
  exercise_template_id: z.string(),
  superset_id: z.number().int().nullable(),
  sets: z.array(setSchema),
});

export const workoutSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  updated_at: z.string(),
  created_at: z.string(),
  exercises: z.array(workoutExerciseSchema),
});

export const workoutsPageSchema = z.object({
  page: z.number().int(),
  page_count: z.number().int(),
  workouts: z.array(workoutSchema),
});

export const workoutsCountSchema = z.object({
  workout_count: z.number().int(),
});

export const routineSetSchema = z.object({
  index: z.number().int(),
  type: z.enum(["warmup", "normal", "failure", "dropset"]),
  weight_kg: z.number().nullable(),
  reps: z.number().int().nullable(),
  distance_meters: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  rpe: z.number().nullable(),
});

export const routineExerciseSchema = z.object({
  index: z.number().int(),
  title: z.string(),
  notes: z.string().nullable(),
  exercise_template_id: z.string(),
  superset_id: z.number().int().nullable(),
  sets: z.array(routineSetSchema),
});

export const routineSchema = z.object({
  id: z.string(),
  title: z.string(),
  folder_id: z.number().int().nullable(),
  updated_at: z.string(),
  created_at: z.string(),
  exercises: z.array(routineExerciseSchema),
});

export const routineFolderSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  updated_at: z.string(),
  created_at: z.string(),
});

export const exerciseTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  primary_muscle_group: z.string(),
  secondary_muscle_groups: z.array(z.string()),
  equipment: z.string().nullable(),
  is_custom: z.boolean(),
});

export type Set = z.infer<typeof setSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutsPage = z.infer<typeof workoutsPageSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type RoutineFolder = z.infer<typeof routineFolderSchema>;
export type ExerciseTemplate = z.infer<typeof exerciseTemplateSchema>;
