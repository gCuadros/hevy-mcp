import { HevyClient } from "./client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function exerciseTemplateDto(id: string, title: string, primaryMuscleGroup = "chest") {
  return {
    id,
    title,
    type: "weight_reps",
    primary_muscle_group: primaryMuscleGroup,
    secondary_muscle_groups: [],
    equipment: null,
    is_custom: false,
  };
}

export function workoutDto(id: string, startTime: string, exerciseTemplateId: string, sets: { weightKg: number; reps: number }[]) {
  return {
    id,
    title: `Workout ${id}`,
    routine_id: null,
    description: null,
    start_time: startTime,
    end_time: startTime,
    updated_at: startTime,
    created_at: startTime,
    exercises: [
      {
        index: 0,
        title: "Bench Press",
        notes: null,
        exercise_template_id: exerciseTemplateId,
        superset_id: null,
        sets: sets.map((s, i) => ({
          index: i,
          type: "normal" as const,
          weight_kg: s.weightKg,
          reps: s.reps,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
          custom_metric: null,
        })),
      },
    ],
  };
}

export function routineSetDto(overrides: Record<string, unknown> = {}) {
  return {
    index: 0,
    type: "normal" as const,
    weight_kg: 40,
    reps: 10,
    distance_meters: null,
    duration_seconds: null,
    custom_metric: null,
    ...overrides,
  };
}

export function routineExerciseDto(exerciseTemplateId: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    index: 0,
    title,
    notes: null,
    exercise_template_id: exerciseTemplateId,
    superset_id: null,
    sets: [routineSetDto()],
    ...overrides,
  };
}

export function routineDto(id: string, title: string, folderId: number | null = null, exercises: unknown[] = []) {
  return { id, title, folder_id: folderId, updated_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", exercises };
}

export function routineFolderDto(id: number, title: string, index = 0) {
  return { id, index, title, updated_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" };
}

/**
 * Builds a HevyClient whose fetchFn serves fixed pages for
 * /v1/workouts, /v1/routines, /v1/routine_folders, /v1/exercise_templates,
 * /v1/workouts/:id — everything paginated as a single page. Good enough for
 * tool-level tests that exercise the live-fetch path without hitting the real API.
 */
export function buildTestClient(fixtures: { workouts?: ReturnType<typeof workoutDto>[]; routines?: ReturnType<typeof routineDto>[]; routineFolders?: ReturnType<typeof routineFolderDto>[]; exerciseTemplates?: ReturnType<typeof exerciseTemplateDto>[] } = {}) {
  const workouts = fixtures.workouts ?? [];
  const routines = fixtures.routines ?? [];
  const routineFolders = fixtures.routineFolders ?? [];
  const exerciseTemplates = fixtures.exerciseTemplates ?? [];

  const fetchFn = async (url: string | URL) => {
    const parsed = new URL(url);
    const path = parsed.pathname;

    if (path === "/v1/workouts") return jsonResponse({ page: 1, page_count: 1, workouts });
    if (path.startsWith("/v1/workouts/")) {
      const id = path.split("/").pop();
      const workout = workouts.find((w) => w.id === id);
      if (!workout) return jsonResponse({ error: "not found" }, 404);
      return jsonResponse(workout);
    }
    if (path === "/v1/routines") return jsonResponse({ page: 1, page_count: 1, routines });
    if (path === "/v1/routine_folders") return jsonResponse({ page: 1, page_count: 1, routine_folders: routineFolders });
    if (path === "/v1/exercise_templates") return jsonResponse({ page: 1, page_count: 1, exercise_templates: exerciseTemplates });

    throw new Error(`buildTestClient: unhandled path ${path}`);
  };

  return new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch });
}

interface RoutineWriteBody {
  title: string;
  notes?: string;
  folder_id?: number | null;
  exercises: unknown[];
}

export interface RecordedWrite {
  method: string;
  path: string;
  // A union rather than one loose shape: a test that reads `.routine` off a folder
  // write should not typecheck. The `?: undefined` arms are what let each key still
  // be read directly off the union before narrowing.
  body: { routine: RoutineWriteBody; routine_folder?: undefined } | { routine_folder: { title: string }; routine?: undefined };
}

/**
 * Like buildTestClient, but serves single routines and accepts writes, keeping
 * every request body for inspection. Write tests care less about what comes
 * back than about what was sent — and, just as much, about the calls that never
 * happen when an exercise fails to resolve.
 */
export function buildWriteTestClient(fixtures: {
  routines?: ReturnType<typeof routineDto>[];
  routineFolders?: ReturnType<typeof routineFolderDto>[];
  exerciseTemplates?: ReturnType<typeof exerciseTemplateDto>[];
}) {
  const routines = fixtures.routines ?? [];
  const routineFolders = fixtures.routineFolders ?? [];
  const exerciseTemplates = fixtures.exerciseTemplates ?? [];
  const writes: RecordedWrite[] = [];
  let nextFolderId = 900;

  const fetchFn = async (url: string | URL, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";

    if (method === "GET" && path === "/v1/routines") return jsonResponse({ page: 1, page_count: 1, routines });
    if (method === "GET" && path === "/v1/routine_folders") return jsonResponse({ page: 1, page_count: 1, routine_folders: routineFolders });
    if (method === "GET" && path === "/v1/exercise_templates") {
      return jsonResponse({ page: 1, page_count: 1, exercise_templates: exerciseTemplates });
    }
    if (method === "GET" && path.startsWith("/v1/routines/")) {
      const routine = routines.find((candidate) => candidate.id === path.split("/").pop());
      if (!routine) return jsonResponse({ error: "not found" }, 404);
      return jsonResponse(routine);
    }

    if (method === "POST" && path === "/v1/routine_folders") {
      const body = JSON.parse(String(init?.body)) as { routine_folder: { title: string } };
      writes.push({ method, path, body });
      // Hevy answers with the created folder at index 0; the wrapped envelope is
      // the shape the routine endpoints use, so exercise the unwrapping here too.
      const created = routineFolderDto(nextFolderId++, body.routine_folder.title, 0);
      return jsonResponse({ routine_folder: created }, 201);
    }

    if (method === "POST" || method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { routine: RoutineWriteBody };
      writes.push({ method, path, body });
      // Hevy answers writes with the stored routine — read-shaped, so with the
      // index and title the write payload doesn't carry. The wrapped envelope
      // is the one seen in the wild, so exercise the unwrapping here too.
      const stored = body.routine.exercises.map((exercise, index) => ({
        ...(exercise as Record<string, unknown>),
        index,
        title: exerciseTemplates.find((t) => t.id === (exercise as { exercise_template_id: string }).exercise_template_id)?.title ?? "Exercise",
        sets: ((exercise as { sets: Record<string, unknown>[] }).sets ?? []).map((set, setIndex) => ({ ...set, index: setIndex })),
      }));
      return jsonResponse(
        { routine: [routineDto("written", body.routine.title, body.routine.folder_id ?? null, stored)] },
        method === "POST" ? 201 : 200,
      );
    }

    throw new Error(`buildWriteTestClient: unhandled ${method} ${path}`);
  };

  return { client: new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch }), writes };
}
