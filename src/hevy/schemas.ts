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

export const createRoutineFolderBodySchema = z.object({
  routine_folder: z.object({ title: z.string().min(1) }),
});

/**
 * Hevy's doc says POST /v1/routine_folders answers with a bare folder, but single-routine
 * responses already come back wrapped and sometimes wrapped in an array, so the same
 * tolerance is applied here. Failing to parse the response of a write that succeeded would
 * report an error for a folder that now exists and cannot be deleted.
 */
export const routineFolderResponseSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && "routine_folder" in value) {
    const inner = (value as { routine_folder: unknown }).routine_folder;
    return Array.isArray(inner) ? inner[0] : inner;
  }
  return value;
}, routineFolderSchema);

/**
 * Every metric is `.optional()` rather than `.nullable()` because the live API omits
 * the fields that were never filled in — a real entry comes back as
 * `{ id, date, weight_kg, created_at }` and nothing else, whatever the docs show.
 * `id` and `created_at` are not in the OpenAPI document at all but are always sent.
 */
export const bodyMeasurementSchema = z.object({
  id: z.number().int().optional(),
  date: z.string(),
  created_at: z.string().optional(),
  weight_kg: z.number().nullish(),
  lean_mass_kg: z.number().nullish(),
  fat_percent: z.number().nullish(),
  neck_cm: z.number().nullish(),
  shoulder_cm: z.number().nullish(),
  chest_cm: z.number().nullish(),
  left_bicep_cm: z.number().nullish(),
  right_bicep_cm: z.number().nullish(),
  left_forearm_cm: z.number().nullish(),
  right_forearm_cm: z.number().nullish(),
  abdomen: z.number().nullish(),
  waist: z.number().nullish(),
  hips: z.number().nullish(),
  left_calf: z.number().nullish(),
  right_calf: z.number().nullish(),
});

export const bodyMeasurementsPageSchema = z.object({
  page: z.number().int(),
  page_count: z.number().int(),
  body_measurements: z.array(bodyMeasurementSchema),
});

/**
 * The write payload. Hevy's docs give POST and PUT different field lists — only PUT
 * declares `hips` — but they are plainly the same record, so both are sent the same
 * shape. If Hevy ignores `hips` on a create the value is lost silently, which is the
 * one part of this that has not been verified against a real account.
 */
export const bodyMeasurementWriteSchema = z.object({
  weight_kg: z.number().nullable().optional(),
  lean_mass_kg: z.number().nullable().optional(),
  fat_percent: z.number().nullable().optional(),
  neck_cm: z.number().nullable().optional(),
  shoulder_cm: z.number().nullable().optional(),
  chest_cm: z.number().nullable().optional(),
  left_bicep_cm: z.number().nullable().optional(),
  right_bicep_cm: z.number().nullable().optional(),
  left_forearm_cm: z.number().nullable().optional(),
  right_forearm_cm: z.number().nullable().optional(),
  abdomen: z.number().nullable().optional(),
  waist: z.number().nullable().optional(),
  hips: z.number().nullable().optional(),
  left_calf: z.number().nullable().optional(),
  right_calf: z.number().nullable().optional(),
});

export const createBodyMeasurementBodySchema = bodyMeasurementWriteSchema.extend({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
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
export type CreateRoutineFolderBody = z.infer<typeof createRoutineFolderBodySchema>;
export type BodyMeasurement = z.infer<typeof bodyMeasurementSchema>;
export type BodyMeasurementsPage = z.infer<typeof bodyMeasurementsPageSchema>;
export type BodyMeasurementWrite = z.infer<typeof bodyMeasurementWriteSchema>;
export type CreateBodyMeasurementBody = z.infer<typeof createBodyMeasurementBodySchema>;
export type ExerciseTemplate = z.infer<typeof exerciseTemplateSchema>;
export type ExerciseTemplatesPage = z.infer<typeof exerciseTemplatesPageSchema>;
