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

export function routineDto(id: string, title: string, folderId: number | null = null) {
  return { id, title, folder_id: folderId, updated_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", exercises: [] };
}

/**
 * Builds a HevyClient whose fetchFn serves fixed pages for
 * /v1/workouts, /v1/routines, /v1/exercise_templates, /v1/workouts/:id —
 * everything paginated as a single page. Good enough for tool-level tests
 * that exercise the live-fetch path without hitting the real API.
 */
export function buildTestClient(fixtures: { workouts?: ReturnType<typeof workoutDto>[]; routines?: ReturnType<typeof routineDto>[]; exerciseTemplates?: ReturnType<typeof exerciseTemplateDto>[] } = {}) {
  const workouts = fixtures.workouts ?? [];
  const routines = fixtures.routines ?? [];
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
    if (path === "/v1/exercise_templates") return jsonResponse({ page: 1, page_count: 1, exercise_templates: exerciseTemplates });

    throw new Error(`buildTestClient: unhandled path ${path}`);
  };

  return new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch });
}
