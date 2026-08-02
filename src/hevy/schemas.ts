import { z } from "zod";

/**
 * Schemas for the Hevy public API (https://api.hevyapp.com/v1).
 * Verified live against a real account (workouts, routines, routine
 * folders, exercise templates, workout events of type "updated"). The
 * "deleted" event variant still follows the public docs only.
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
  routine_id: z.string().nullable(),
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

// "updated" verified live against a real account; "deleted" follows the
// public docs — no deleted workouts were available to confirm the shape.
export const workoutEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("updated"), workout: workoutSchema }),
  z.object({ type: z.literal("deleted"), id: z.string(), deleted_at: z.string() }),
]);

// When there are no new events, Hevy returns `{ page, page_count, workouts: [] }`
// instead of `{ page, page_count, events: [] }` — verified live. Normalize both
// shapes to always expose `events`.
export const workoutEventsPageSchema = z
  .object({
    page: z.number().int(),
    page_count: z.number().int(),
    events: z.array(workoutEventSchema).optional(),
    workouts: z.array(z.unknown()).optional(),
  })
  .transform((data) => ({ page: data.page, page_count: data.page_count, events: data.events ?? [] }));

export const repRangeSchema = z.object({
  start: z.number().nullish().transform((value) => value ?? null),
  end: z.number().nullish().transform((value) => value ?? null),
});

/**
 * Hevy documents rest_seconds as an integer when you write it and a string
 * when you read it back. Accept both: this value only exists to be carried
 * through an update untouched, and losing it would silently wipe the rest
 * timers off every exercise in the routine.
 */
const restSecondsSchema = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

export const routineSetSchema = z.object({
  index: z.number().int(),
  type: z.enum(["warmup", "normal", "failure", "dropset"]),
  weight_kg: z.number().nullable(),
  reps: z.number().int().nullable(),
  distance_meters: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  // Unlike workout sets, Hevy omits this key entirely on routine sets
  // instead of sending it as null.
  rpe: z
    .number()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  custom_metric: z.number().nullable(),
  rep_range: repRangeSchema.nullish().transform((value) => value ?? null),
});

export const routineExerciseSchema = z.object({
  index: z.number().int(),
  title: z.string(),
  notes: z.string().nullable(),
  exercise_template_id: z.string(),
  superset_id: z.number().int().nullable(),
  rest_seconds: restSecondsSchema,
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

export const routinesPageSchema = z.object({
  page: z.number().int(),
  page_count: z.number().int(),
  routines: z.array(routineSchema),
});

/**
 * Single-routine responses. The docs promise a bare Routine, but Hevy also
 * answers `{ routine: … }` and `{ routine: [ … ] }` depending on the endpoint,
 * so unwrap all three rather than fail a write that already went through.
 */
export const routineResponseSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && "routine" in value) {
    const inner = (value as { routine: unknown }).routine;
    return Array.isArray(inner) ? inner[0] : inner;
  }
  return value;
}, routineSchema);

/** Payloads sent to POST/PUT /v1/routines. Shapes verified against Hevy's OpenAPI doc. */
export const routineWriteSetSchema = z.object({
  type: z.enum(["warmup", "normal", "failure", "dropset"]),
  weight_kg: z.number().nullable(),
  reps: z.number().int().nullable(),
  distance_meters: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  custom_metric: z.number().nullable(),
  rep_range: z.object({ start: z.number(), end: z.number() }).nullable(),
});

export const routineWriteExerciseSchema = z.object({
  exercise_template_id: z.string(),
  superset_id: z.number().int().nullable(),
  rest_seconds: z.number().int().nullable(),
  notes: z.string().nullable(),
  sets: z.array(routineWriteSetSchema),
});

export const createRoutineBodySchema = z.object({
  routine: z.object({
    title: z.string().min(1),
    folder_id: z.number().int().nullable(),
    notes: z.string().optional(),
    exercises: z.array(routineWriteExerciseSchema),
  }),
});

export const updateRoutineBodySchema = z.object({
  routine: z.object({
    title: z.string().min(1),
    notes: z.string().optional(),
    exercises: z.array(routineWriteExerciseSchema),
  }),
});

export const routineFolderSchema = z.object({
  id: z.number().int(),
  index: z.number().int(),
  title: z.string(),
  updated_at: z.string(),
  created_at: z.string(),
});

export const routineFoldersPageSchema = z.object({
  page: z.number().int(),
  page_count: z.number().int(),
  routine_folders: z.array(routineFolderSchema),
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

export const exerciseTemplatesPageSchema = z.object({
  page: z.number().int(),
  page_count: z.number().int(),
  exercise_templates: z.array(exerciseTemplateSchema),
});

export type Set = z.infer<typeof setSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutsPage = z.infer<typeof workoutsPageSchema>;
export type WorkoutEvent = z.infer<typeof workoutEventSchema>;
export type WorkoutEventsPage = z.infer<typeof workoutEventsPageSchema>;
export type Routine = z.infer<typeof routineSchema>;
export type RoutinesPage = z.infer<typeof routinesPageSchema>;
export type RoutineWriteSet = z.infer<typeof routineWriteSetSchema>;
export type RoutineWriteExercise = z.infer<typeof routineWriteExerciseSchema>;
export type CreateRoutineBody = z.infer<typeof createRoutineBodySchema>;
export type UpdateRoutineBody = z.infer<typeof updateRoutineBodySchema>;
export type RoutineFolder = z.infer<typeof routineFolderSchema>;
export type RoutineFoldersPage = z.infer<typeof routineFoldersPageSchema>;
export type ExerciseTemplate = z.infer<typeof exerciseTemplateSchema>;
export type ExerciseTemplatesPage = z.infer<typeof exerciseTemplatesPageSchema>;
