import { toDomainBodyMeasurement } from "../hevy/adapter.js";
import type { HevyClient } from "../hevy/client.js";
import { fetchAllRoutineFolders, fetchAllRoutines } from "../hevy/fetchAll.js";
import type { BodyMeasurementWrite, Routine, RoutineWriteExercise, RoutineWriteSet } from "../hevy/schemas.js";
import type { DomainBodyMeasurement, SetType } from "../domain/types.js";
import { resolveExercise, resolveRoutineFolder, type ExerciseCandidate, type ReadDeps, type RoutineFolderCandidate } from "./read.js";

export type WriteDeps = ReadDeps;

export interface RoutineSetInput {
  type?: SetType | undefined;
  weightKg?: number | null | undefined;
  reps?: number | null | undefined;
  repRange?: { start: number; end: number } | null | undefined;
  distanceMeters?: number | null | undefined;
  durationSeconds?: number | null | undefined;
}

export interface RoutineExerciseInput {
  exercise: string;
  notes?: string | null | undefined;
  restSeconds?: number | null | undefined;
  supersetId?: number | null | undefined;
  sets: RoutineSetInput[];
}

export interface ExerciseProblem {
  exercise: string;
  status: "ambiguous" | "not-found";
  candidates?: ExerciseCandidate[];
}

export type WriteResult<T> = { status: "written"; result: T } | { status: "unresolved"; problems: ExerciseProblem[] };

function toWriteSet(set: RoutineSetInput): RoutineWriteSet {
  return {
    type: set.type ?? "normal",
    weight_kg: set.weightKg ?? null,
    reps: set.reps ?? null,
    distance_meters: set.distanceMeters ?? null,
    duration_seconds: set.durationSeconds ?? null,
    custom_metric: null,
    rep_range: set.repRange ?? null,
  };
}

/**
 * Resolves every exercise name before writing anything. Hevy has no DELETE and
 * no transactions, so a routine half-built from the names that happened to
 * resolve would be worse than no routine: the user would have to clean it up by
 * hand. Either the whole thing is writable or nothing is sent.
 */
async function toWriteExercises(
  deps: WriteDeps,
  inputs: RoutineExerciseInput[],
): Promise<{ exercises: RoutineWriteExercise[] } | { problems: ExerciseProblem[] }> {
  const exercises: RoutineWriteExercise[] = [];
  const problems: ExerciseProblem[] = [];

  for (const input of inputs) {
    const resolved = await resolveExercise(deps, input.exercise);
    if (resolved.status === "resolved") {
      exercises.push({
        exercise_template_id: resolved.template.id,
        superset_id: input.supersetId ?? null,
        rest_seconds: input.restSeconds ?? null,
        notes: input.notes ?? null,
        sets: input.sets.map(toWriteSet),
      });
      continue;
    }
    problems.push(
      resolved.status === "ambiguous"
        ? { exercise: input.exercise, status: "ambiguous", candidates: resolved.candidates }
        : { exercise: input.exercise, status: "not-found" },
    );
  }

  return problems.length > 0 ? { problems } : { exercises };
}

export interface RoutineSummary {
  id: string;
  title: string;
  folderId: number | null;
  exercises: { title: string; sets: number }[];
}

function summarize(routine: Routine): RoutineSummary {
  return {
    id: routine.id,
    title: routine.title,
    folderId: routine.folder_id,
    exercises: routine.exercises.map((exercise) => ({ title: exercise.title, sets: exercise.sets.length })),
  };
}

export interface CreateRoutineInput {
  title: string;
  notes?: string | undefined;
  folder?: string | undefined;
  exercises: RoutineExerciseInput[];
}

export type CreateRoutineResult =
  | WriteResult<RoutineSummary>
  | { status: "folder-ambiguous"; folder: string; candidates: RoutineFolderCandidate[] }
  | { status: "folder-not-found"; folder: string };

export async function createRoutine(deps: WriteDeps, input: CreateRoutineInput): Promise<CreateRoutineResult> {
  // Folder before exercises: it is one short list against the whole catalogue,
  // so a folder name that does not resolve fails on the cheap lookup. Both run
  // before anything is sent — a routine dropped in the wrong folder cannot be
  // moved back through the API.
  let folderId: number | null = null;
  if (input.folder !== undefined) {
    const folder = await resolveRoutineFolder(deps, input.folder);
    if (folder.status === "ambiguous") {
      return { status: "folder-ambiguous", folder: input.folder, candidates: folder.candidates };
    }
    if (folder.status === "not-found") return { status: "folder-not-found", folder: input.folder };
    folderId = folder.folder.id;
  }

  const resolved = await toWriteExercises(deps, input.exercises);
  if ("problems" in resolved) return { status: "unresolved", problems: resolved.problems };

  const routine = await deps.client.createRoutine({
    routine: {
      title: input.title,
      folder_id: folderId,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      exercises: resolved.exercises,
    },
  });

  return { status: "written", result: summarize(routine) };
}

export interface RoutineFolderSummary {
  id: number;
  index: number;
  title: string;
}

export type CreateRoutineFolderResult =
  | { status: "written"; result: RoutineFolderSummary }
  | { status: "duplicate"; existing: RoutineFolderSummary };

/**
 * Refuses to create a folder whose title already exists. Hevy has no DELETE, so a
 * second "Push Pull" is permanent clutter — and worse, it makes that name ambiguous
 * forever, so create-routine can no longer file anything into either of them. The
 * existing folder is returned instead, which is what the caller wanted anyway.
 */
export async function createRoutineFolder(deps: WriteDeps, input: { title: string }): Promise<CreateRoutineFolderResult> {
  const title = input.title.trim();
  const existing = (await fetchAllRoutineFolders(deps.client)).find((folder) => folder.title.toLowerCase() === title.toLowerCase());
  if (existing) {
    return { status: "duplicate", existing: { id: existing.id, index: existing.index, title: existing.title } };
  }

  const folder = await deps.client.createRoutineFolder({ routine_folder: { title } });
  return { status: "written", result: { id: folder.id, index: folder.index, title: folder.title } };
}

/** The metric names a caller may set, mapped to the wire names Hevy uses for them. */
const MEASUREMENT_FIELDS = {
  weightKg: "weight_kg",
  leanMassKg: "lean_mass_kg",
  fatPercent: "fat_percent",
  neckCm: "neck_cm",
  shoulderCm: "shoulder_cm",
  chestCm: "chest_cm",
  leftBicepCm: "left_bicep_cm",
  rightBicepCm: "right_bicep_cm",
  leftForearmCm: "left_forearm_cm",
  rightForearmCm: "right_forearm_cm",
  abdomenCm: "abdomen",
  waistCm: "waist",
  hipsCm: "hips",
  leftCalfCm: "left_calf",
  rightCalfCm: "right_calf",
} as const satisfies Record<string, keyof BodyMeasurementWrite>;

export type MeasurementField = keyof typeof MEASUREMENT_FIELDS;

export type LogBodyMeasurementInput = { date: string } & { [K in MeasurementField]?: number | undefined };

export type LogBodyMeasurementResult =
  | { status: "created"; date: string; measurement: DomainBodyMeasurement }
  | { status: "updated"; date: string; measurement: DomainBodyMeasurement; kept: MeasurementField[] }
  | { status: "empty"; date: string };

/**
 * Upsert for one day's measurements, because Hevy splits it across two endpoints that
 * both bite:
 *
 * - POST answers 409 when the date already has an entry, so a plain create fails the
 *   second time the user weighs in on a day they already logged.
 * - PUT overwrites the whole record: every field left out is set to null. Logging a
 *   weight would silently wipe the body-fat percentage stored alongside it.
 *
 * So the stored entry is read first and the new values are merged over it, the same
 * round-trip toWritePayload does for routines. Fields the caller did not mention are
 * reported back in `kept`, so the answer can say what was preserved rather than leaving
 * the user to trust it.
 */
export async function logBodyMeasurement(deps: WriteDeps, input: LogBodyMeasurementInput): Promise<LogBodyMeasurementResult> {
  const provided = (Object.keys(MEASUREMENT_FIELDS) as MeasurementField[]).filter((field) => typeof input[field] === "number");
  // A create with nothing but a date would leave an empty entry that cannot be deleted.
  if (provided.length === 0) return { status: "empty", date: input.date };

  const existing = await deps.client.getBodyMeasurementByDate(input.date);
  const payload: BodyMeasurementWrite = {};
  const kept: MeasurementField[] = [];

  for (const field of Object.keys(MEASUREMENT_FIELDS) as MeasurementField[]) {
    const wireField = MEASUREMENT_FIELDS[field];
    const incoming = input[field];
    if (typeof incoming === "number") {
      payload[wireField] = incoming;
      continue;
    }
    const stored = existing?.[wireField];
    if (typeof stored === "number") {
      payload[wireField] = stored;
      kept.push(field);
    }
  }

  if (existing) {
    await deps.client.updateBodyMeasurement(input.date, payload);
  } else {
    await deps.client.createBodyMeasurement({ ...payload, date: input.date });
  }

  // Both writes answer with an empty body, so the stored entry is read back rather than
  // echoing what was sent. It is also the only way to see what Hevy actually kept.
  const stored = await deps.client.getBodyMeasurementByDate(input.date);
  const measurement = stored ? toDomainBodyMeasurement(stored) : { date: input.date };

  return existing ? { status: "updated", date: input.date, measurement, kept } : { status: "created", date: input.date, measurement };
}

export interface RoutineCandidate {
  id: string;
  title: string;
}

export type ResolveRoutineResult =
  | { status: "resolved"; id: string }
  | { status: "ambiguous"; candidates: RoutineCandidate[] }
  | { status: "not-found" };

/** Same contract as resolveExercise: an ID wins, an exact title wins, ambiguity never guesses. */
export async function resolveRoutine(deps: WriteDeps, ref: string): Promise<ResolveRoutineResult> {
  const routines = await fetchAllRoutines(deps.client);

  const byId = routines.find((routine) => routine.id === ref);
  if (byId) return { status: "resolved", id: byId.id };

  const query = ref.trim().toLowerCase();
  const exact = routines.filter((routine) => routine.title.toLowerCase() === query);
  if (exact.length === 1 && exact[0]) return { status: "resolved", id: exact[0].id };

  const partial = routines.filter((routine) => routine.title.toLowerCase().includes(query));
  if (partial.length === 1 && partial[0]) return { status: "resolved", id: partial[0].id };
  if (partial.length > 1) {
    return { status: "ambiguous", candidates: partial.map((routine) => ({ id: routine.id, title: routine.title })) };
  }

  return { status: "not-found" };
}

/**
 * Rebuilds the full write payload from what Hevy currently holds. The API only
 * offers PUT, which replaces the routine wholesale, so anything absent from the
 * body is erased — rest timers and rep ranges included. Round-tripping the
 * stored values means an update that only changes the title cannot quietly
 * flatten the rest of the routine.
 */
function toWritePayload(routine: Routine): RoutineWriteExercise[] {
  return routine.exercises.map((exercise) => ({
    exercise_template_id: exercise.exercise_template_id,
    superset_id: exercise.superset_id,
    rest_seconds: exercise.rest_seconds,
    notes: exercise.notes,
    sets: exercise.sets.map((set) => ({
      type: set.type,
      weight_kg: set.weight_kg,
      reps: set.reps,
      distance_meters: set.distance_meters,
      duration_seconds: set.duration_seconds,
      custom_metric: set.custom_metric,
      rep_range:
        set.rep_range && set.rep_range.start !== null && set.rep_range.end !== null
          ? { start: set.rep_range.start, end: set.rep_range.end }
          : null,
    })),
  }));
}

export interface UpdateRoutineInput {
  routine: string;
  title?: string | undefined;
  notes?: string | undefined;
  exercises?: RoutineExerciseInput[] | undefined;
}

export type UpdateRoutineResult =
  | WriteResult<RoutineSummary>
  | { status: "ambiguous"; candidates: RoutineCandidate[] }
  | { status: "not-found" };

export async function updateRoutine(deps: WriteDeps, input: UpdateRoutineInput): Promise<UpdateRoutineResult> {
  const target = await resolveRoutine(deps, input.routine);
  if (target.status !== "resolved") return target;

  const current = await deps.client.getRoutineById(target.id);

  let exercises = toWritePayload(current);
  if (input.exercises) {
    const resolved = await toWriteExercises(deps, input.exercises);
    if ("problems" in resolved) return { status: "unresolved", problems: resolved.problems };
    exercises = resolved.exercises;
  }

  const routine = await deps.client.updateRoutine(target.id, {
    routine: {
      title: input.title ?? current.title,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      exercises,
    },
  });

  return { status: "written", result: summarize(routine) };
}
