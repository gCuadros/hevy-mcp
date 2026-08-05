import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolResult } from "./format.js";
import { registerPrompts } from "./prompts.js";
import { buildResources } from "./resources.js";
import {
  comparePeriodsTool,
  getBodyweightTrend,
  getConsistency,
  getProgress,
  getRecords,
  getVolumeReport,
  type AnalyticsDeps,
} from "./tools/analytics.js";
import { runHealthCheck, type ToolDeps } from "./tools/health.js";
import {
  getBodyMeasurements,
  getExerciseHistory,
  getRoutine,
  getWorkout,
  getWorkouts,
  listRoutineFolders,
  listRoutines,
  searchExercises,
  type ReadDeps,
} from "./tools/read.js";
import { createRoutine, createRoutineFolder, logBodyMeasurement, updateRoutine, type WriteDeps } from "./tools/write.js";
import { VERSION } from "./version.js";

type Deps = ToolDeps & ReadDeps & AnalyticsDeps & WriteDeps;

function ambiguousOrNotFound(subject: string, result: { status: "ambiguous" | "not-found"; candidates?: unknown }) {
  if (result.status === "not-found") return formatToolResult(`No exercise found matching "${subject}"`, result, true);
  return formatToolResult(`"${subject}" is ambiguous — retry with an exact ID`, result, true);
}

/** Transport-agnostic McpServer: same instance is shared by stdio.ts and http.ts. */
export function createServer(deps: Deps): McpServer {
  const server = new McpServer({ name: "hevy-coach-mcp", version: VERSION });

  server.registerTool(
    "health-check",
    {
      title: "Health check",
      description: "Checks whether the Hevy API key is valid. Call this first when troubleshooting a connection issue.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await runHealthCheck(deps);
      return formatToolResult(`Hevy connection: ${result.status}`, result, result.status === "error");
    },
  );

  server.registerTool(
    "get-workouts",
    {
      title: "Get workouts",
      description:
        "Lists workouts from Hevy with a compact summary (title, dates, exercise/set counts), optionally filtered by date range. Use get-workout for full detail on a single one. Fetches live from Hevy — no local cache.",
      inputSchema: {
        from: z.string().optional().describe("ISO date/time lower bound (inclusive)"),
        to: z.string().optional().describe("ISO date/time upper bound (inclusive)"),
        limit: z.number().int().positive().optional().describe("Max results, most recent first (default 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const result = await getWorkouts(deps, input);
      return formatToolResult(`Found ${result.workouts.length} workout(s)`, result);
    },
  );

  server.registerTool(
    "get-workout",
    {
      title: "Get workout",
      description: "Fetches full detail (all exercises and sets) for a single workout by ID.",
      inputSchema: { id: z.string().describe("Workout ID, from get-workouts or hevy://workouts/recent") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const workout = await getWorkout(deps, { id });
      if (!workout) return formatToolResult(`Workout ${id} not found`, { error: "not_found" }, true);
      return formatToolResult(workout.title, workout);
    },
  );

  server.registerTool(
    "list-routines",
    {
      title: "List routines",
      description: "Lists routines with a compact summary (title, folder, exercise count).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await listRoutines(deps);
      return formatToolResult(`Found ${result.routines.length} routine(s)`, result);
    },
  );

  server.registerTool(
    "get-routine",
    {
      title: "Get routine",
      description: "Fetches full detail (all exercises and target sets) for a single routine by ID.",
      inputSchema: { id: z.string().describe("Routine ID, from list-routines or hevy://routines") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const routine = await getRoutine(deps, { id });
      if (!routine) return formatToolResult(`Routine ${id} not found`, { error: "not_found" }, true);
      return formatToolResult(routine.title, routine);
    },
  );

  server.registerTool(
    "list-routine-folders",
    {
      title: "List routine folders",
      description:
        "Lists the folders the user organises routines into, with their IDs. Call this when the user mentions a folder by name and you need to know whether it exists, or to show what folders are available before creating a routine. create-routine resolves folder names on its own, so this is not a required step before it — use it to disambiguate when it comes back with candidates, or when the user asks what folders they have.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await listRoutineFolders(deps);
      return formatToolResult(`Found ${result.folders.length} folder(s)`, result);
    },
  );

  server.registerTool(
    "get-body-measurements",
    {
      title: "Get body measurements",
      description:
        "Returns the user's logged bodyweight and body measurements, newest first. Use it when the question involves bodyweight — cutting or bulking, strength relative to bodyweight, whether a stall lines up with a weight change — or when the user asks about their measurements directly. Only metrics the user actually recorded come back; a missing field means it was never logged, not zero. This is separate from workouts: many accounts have few entries or none at all.",
      inputSchema: {
        from: z.string().optional().describe("Earliest date to include, YYYY-MM-DD"),
        to: z.string().optional().describe("Latest date to include, YYYY-MM-DD"),
        limit: z.number().int().positive().optional().describe("How many entries to return, newest first (default 30)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const result = await getBodyMeasurements(deps, input);
      return formatToolResult(`${result.measurements.length} entr(ies) of ${result.totalLogged} logged`, result);
    },
  );

  server.registerTool(
    "get-bodyweight-trend",
    {
      title: "Get bodyweight trend",
      description:
        "Returns how the user's bodyweight has moved over a date range: total change in kg and percent, the weekly rate, the lightest and heaviest weigh-in, and every weigh-in in the range. Use it for 'is my cut on track', 'how fast am I gaining', or before judging whether a strength stall is really a weight change. Needs at least two weigh-ins in the range; below that the trend is null and only the weigh-ins come back, because one weight is not a trend. Prefer get-progress with relativeToBodyweight when the question is about a specific lift rather than the weight itself.",
      inputSchema: {
        from: z.string().optional().describe("Earliest date to include, YYYY-MM-DD"),
        to: z.string().optional().describe("Latest date to include, YYYY-MM-DD"),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const result = await getBodyweightTrend(deps, input);
      const summary = result.trend
        ? `${result.trend.changeKg >= 0 ? "+" : ""}${result.trend.changeKg} kg over ${result.trend.spanDays} day(s)`
        : `${result.series.length} weigh-in(s) — not enough for a trend`;
      return formatToolResult(summary, result);
    },
  );

  server.registerTool(
    "search-exercises",
    {
      title: "Search exercises",
      description:
        "Finds exercise template IDs by human name (case-insensitive substring match). Use this before get-exercise-history when you only have a name, not an ID — names are ambiguous (e.g. 'Bench Press' vs 'Incline Bench Press'), so check the match count.",
      inputSchema: { query: z.string().describe("Exercise name or template ID") },
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const result = await searchExercises(deps, { query });
      return formatToolResult(`Found ${result.matches.length} match(es) for "${query}"`, result);
    },
  );

  server.registerTool(
    "get-exercise-history",
    {
      title: "Get exercise history",
      description:
        "Returns every set logged for a given exercise across all workouts, most recent first, each with the workout it belongs to and its set type (warmup, normal, failure, dropset). Cheap: it asks Hevy for this one exercise rather than scanning the whole training log. Use it to see what was actually done rather than a summary — prefer get-progress for the e1RM trend and get-records for PRs. totalSessions reports how many sessions exist regardless of the limit. Accepts a human name or a template ID; if the name is ambiguous, returns candidates instead of guessing — call search-exercises or re-call with the exact ID.",
      inputSchema: {
        exercise: z.string().describe("Exercise name or template ID"),
        limit: z.number().int().positive().optional().describe("Max history entries, most recent first (default 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ exercise, limit }) => {
      const result = await getExerciseHistory(deps, { exercise, limit });
      if (result.status === "not-found") {
        return formatToolResult(`No exercise found matching "${exercise}"`, result, true);
      }
      if (result.status === "ambiguous") {
        return formatToolResult(`"${exercise}" is ambiguous (${result.candidates.length} matches) — retry with an exact ID`, result, true);
      }
      return formatToolResult(`${result.history.length} of ${result.totalSessions} session(s) for ${result.template.title}`, result);
    },
  );

  server.registerTool(
    "get-progress",
    {
      title: "Get exercise progress",
      description:
        "Returns the estimated-1RM trend over time (best set per session, Epley by default) for a given exercise. Use this to answer 'have I progressed on X'. Set relativeToBodyweight when the question involves the user's weight — training through a cut or a bulk, a weight class, 'am I getting stronger or just heavier' — and each session also carries the nearest logged bodyweight and the e1RM as a multiple of it. Leave it off otherwise: it costs a second fetch, and sessions with no weigh-in within two weeks simply come back without those fields. Accepts a human name or template ID; ambiguous names return candidates instead of guessing.",
      inputSchema: {
        exercise: z.string().describe("Exercise name or template ID"),
        formula: z.enum(["epley", "brzycki"]).optional().describe("e1RM formula (default epley)"),
        relativeToBodyweight: z.boolean().optional().describe("Also express each session's e1RM as a multiple of the nearest logged bodyweight (default false)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ exercise, formula, relativeToBodyweight }) => {
      const result = await getProgress(deps, { exercise, formula, relativeToBodyweight });
      if (result.status !== "resolved") return ambiguousOrNotFound(exercise, result);
      return formatToolResult(`${result.progress.length} session(s) with an e1RM for ${result.template.title}`, result);
    },
  );

  server.registerTool(
    "get-records",
    {
      title: "Get exercise records",
      description:
        "Returns PRs (heaviest weight for at least 1/3/5/8 reps) for a given exercise. Accepts a human name or template ID; ambiguous names return candidates instead of guessing.",
      inputSchema: { exercise: z.string().describe("Exercise name or template ID") },
      annotations: { readOnlyHint: true },
    },
    async ({ exercise }) => {
      const result = await getRecords(deps, { exercise });
      if (result.status !== "resolved") return ambiguousOrNotFound(exercise, result);
      return formatToolResult(`Records for ${result.template.title}`, result);
    },
  );

  server.registerTool(
    "get-volume-report",
    {
      title: "Get volume report",
      description: "Effective sets and tonnage per muscle group per week, across all workouts. Use this to spot under- or over-trained muscle groups.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await getVolumeReport(deps);
      return formatToolResult(`${result.weeks.length} muscle-group/week bucket(s)`, result);
    },
  );

  server.registerTool(
    "get-consistency",
    {
      title: "Get consistency",
      description: "Training frequency, current streak, and longest gap between workouts, across all workouts.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await getConsistency(deps);
      return formatToolResult(`${result.workoutCount} workout(s), current streak ${result.currentStreakWeeks} week(s)`, result);
    },
  );

  server.registerTool(
    "compare-periods",
    {
      title: "Compare periods",
      description: "Compares workout count/volume/tonnage for a date range against the immediately preceding period of equal length.",
      inputSchema: {
        from: z.string().describe("ISO date/time: start of the period to evaluate"),
        to: z.string().describe("ISO date/time: end of the period to evaluate"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ from, to }) => {
      const result = await comparePeriodsTool(deps, { from, to });
      return formatToolResult(`Current: ${result.current.workoutCount} workout(s) vs previous: ${result.previous.workoutCount}`, result);
    },
  );

  const setInputSchema = z.object({
    type: z.enum(["warmup", "normal", "failure", "dropset"]).optional().describe("Defaults to normal"),
    weightKg: z.number().nullable().optional(),
    reps: z.number().int().nullable().optional(),
    repRange: z.object({ start: z.number().int(), end: z.number().int() }).nullable().optional().describe("Target rep range, e.g. 8-12"),
    distanceMeters: z.number().nullable().optional(),
    durationSeconds: z.number().int().nullable().optional().describe("For timed work — planks, carries, TRX holds"),
  });

  const exerciseInputSchema = z.object({
    exercise: z.string().describe("Exercise name or template ID. Ambiguous names are rejected, not guessed."),
    sets: z.array(setInputSchema).describe("One entry per set. Three sets of 10 means three entries."),
    restSeconds: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
    supersetId: z.number().int().nullable().optional().describe("Same number on two exercises pairs them as a superset"),
  });

  server.registerTool(
    "create-routine",
    {
      title: "Create routine",
      description:
        "Creates a new routine in Hevy. Use when the user asks for a training plan to be saved rather than described. This writes to the user's Hevy account and cannot be undone from here — Hevy's API has no delete, so a routine created by mistake has to be removed by hand in the app. Confirm the plan with the user before calling. Exercise names are resolved against Hevy's catalogue; ambiguous ones come back as a candidate list to pick from, and nothing is written until every exercise resolves.",
      inputSchema: {
        title: z.string().describe("Routine title as it will appear in Hevy"),
        exercises: z.array(exerciseInputSchema),
        notes: z.string().optional(),
        folder: z
          .string()
          .optional()
          .describe("Folder name or ID, from list-routine-folders. Ambiguous names are rejected, not guessed. Omit for the default 'My Routines'."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      const result = await createRoutine(deps, input);
      if (result.status === "folder-not-found") {
        return formatToolResult(`Nothing was written — no folder matching "${result.folder}"`, result, true);
      }
      if (result.status === "folder-ambiguous") {
        return formatToolResult(`Nothing was written — "${result.folder}" matches more than one folder`, result, true);
      }
      if (result.status === "unresolved") {
        return formatToolResult("Nothing was written — some exercises could not be resolved", result, true);
      }
      return formatToolResult(`Created "${result.result.title}" with ${result.result.exercises.length} exercise(s)`, result.result);
    },
  );

  server.registerTool(
    "create-routine-folder",
    {
      title: "Create routine folder",
      description:
        "Creates a routine folder in Hevy. Use only when the user asks for a new folder, or when create-routine reported that the folder they named does not exist and they confirmed they want it created. Check list-routine-folders first: a folder whose title already exists is not created again, because Hevy's API has no delete and a duplicate title would make that name ambiguous for every later routine. New folders are placed at the top of the list, shifting the others down.",
      inputSchema: {
        title: z.string().describe("Folder title as it will appear in Hevy"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      const result = await createRoutineFolder(deps, input);
      if (result.status === "duplicate") {
        return formatToolResult(`Nothing was created — "${result.existing.title}" already exists`, result);
      }
      return formatToolResult(`Created folder "${result.result.title}"`, result.result);
    },
  );

  server.registerTool(
    "update-routine",
    {
      title: "Update routine",
      description:
        "Changes an existing routine in Hevy. Use for progression (bumping loads, adding a set) or renaming. Omit `exercises` to keep the current ones untouched; passing it REPLACES every exercise in the routine, so send the complete list, not just the ones that changed. Read the routine first with get-routine and confirm with the user — the previous version is not recoverable.",
      inputSchema: {
        routine: z.string().describe("Routine title or ID. Ambiguous titles are rejected, not guessed."),
        title: z.string().optional().describe("New title; omit to keep the current one"),
        exercises: z.array(exerciseInputSchema).optional().describe("Complete replacement list; omit to leave exercises alone"),
        notes: z.string().optional().describe("Hevy does not return routine notes on read, so they can only be set, never preserved"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      const result = await updateRoutine(deps, input);
      if (result.status === "not-found") {
        return formatToolResult(`No routine found matching "${input.routine}"`, result, true);
      }
      if (result.status === "ambiguous") {
        return formatToolResult(`"${input.routine}" matches more than one routine — retry with an ID`, result, true);
      }
      if (result.status === "unresolved") {
        return formatToolResult("Nothing was written — some exercises could not be resolved", result, true);
      }
      return formatToolResult(`Updated "${result.result.title}"`, result.result);
    },
  );

  server.registerTool(
    "log-body-measurement",
    {
      title: "Log body measurement",
      description:
        "Records bodyweight or body measurements for one date in Hevy. Use it only when the user gives you a measurement and asks for it to be saved — never infer one. Pass the date explicitly, in the user's own timezone, and pass only the metrics they actually stated. If that date already has an entry the given metrics are updated and everything else stored for that day is preserved; Hevy's API has no delete, so a wrong date has to be fixed in the app.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date of the measurement, YYYY-MM-DD, in the user's timezone"),
        weightKg: z.number().positive().optional().describe("Bodyweight in kilograms"),
        leanMassKg: z.number().positive().optional(),
        fatPercent: z.number().positive().optional().describe("Body fat percentage, e.g. 18.5"),
        neckCm: z.number().positive().optional(),
        shoulderCm: z.number().positive().optional(),
        chestCm: z.number().positive().optional(),
        leftBicepCm: z.number().positive().optional(),
        rightBicepCm: z.number().positive().optional(),
        leftForearmCm: z.number().positive().optional(),
        rightForearmCm: z.number().positive().optional(),
        abdomenCm: z.number().positive().optional(),
        waistCm: z.number().positive().optional(),
        hipsCm: z.number().positive().optional(),
        leftCalfCm: z.number().positive().optional(),
        rightCalfCm: z.number().positive().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      const result = await logBodyMeasurement(deps, input);
      if (result.status === "empty") {
        return formatToolResult("Nothing was written — no measurement was given, only a date", result, true);
      }
      if (result.status === "updated") {
        const kept = result.kept.length > 0 ? `, keeping ${result.kept.join(", ")}` : "";
        return formatToolResult(`Updated the entry for ${result.date}${kept}`, result);
      }
      return formatToolResult(`Logged measurements for ${result.date}`, result);
    },
  );

  registerPrompts(server);

  server.registerResource("profile", "hevy://profile", { title: "Profile summary", mimeType: "application/json" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify((await buildResources(deps)).profile) }],
  }));

  server.registerResource("routines", "hevy://routines", { title: "Routines", mimeType: "application/json" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify((await buildResources(deps)).routines) }],
  }));

  server.registerResource("exercises", "hevy://exercises", { title: "Exercise templates", mimeType: "application/json" }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify((await buildResources(deps)).exercises) }],
  }));

  server.registerResource(
    "stats-summary",
    "hevy://stats/summary",
    { title: "Stats summary", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify((await buildResources(deps)).statsSummary) }],
    }),
  );

  server.registerResource(
    "workouts-recent",
    "hevy://workouts/recent",
    { title: "10 most recent workouts", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify((await buildResources(deps)).recentWorkouts) }],
    }),
  );

  return server;
}
