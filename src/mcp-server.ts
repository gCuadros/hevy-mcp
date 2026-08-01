import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolResult } from "./format.js";
import { registerPrompts } from "./prompts.js";
import { buildResources } from "./resources.js";
import {
  comparePeriodsTool,
  getConsistency,
  getProgress,
  getRecords,
  getVolumeReport,
  type AnalyticsDeps,
} from "./tools/analytics.js";
import { runHealthCheck, type ToolDeps } from "./tools/health.js";
import {
  getExerciseHistory,
  getRoutine,
  getWorkout,
  getWorkouts,
  listRoutines,
  searchExercises,
  type ReadDeps,
} from "./tools/read.js";

type Deps = ToolDeps & ReadDeps & AnalyticsDeps;

function ambiguousOrNotFound(subject: string, result: { status: "ambiguous" | "not-found"; candidates?: unknown }) {
  if (result.status === "not-found") return formatToolResult(`No exercise found matching "${subject}"`, result, true);
  return formatToolResult(`"${subject}" is ambiguous — retry with an exact ID`, result, true);
}

/** Transport-agnostic McpServer: same instance is shared by stdio.ts and http.ts. */
export function createServer(deps: Deps): McpServer {
  const server = new McpServer({ name: "hevy-coach-mcp", version: "0.0.0" });

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
        "Returns every set logged for a given exercise across all workouts, most recent first. Accepts a human name or a template ID; if the name is ambiguous, returns candidates instead of guessing — call search-exercises or re-call with the exact ID.",
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
      return formatToolResult(`${result.history.length} session(s) for ${result.template.title}`, result);
    },
  );

  server.registerTool(
    "get-progress",
    {
      title: "Get exercise progress",
      description:
        "Returns the estimated-1RM trend over time (best set per session, Epley by default) for a given exercise. Use this to answer 'have I progressed on X'. Accepts a human name or template ID; ambiguous names return candidates instead of guessing.",
      inputSchema: {
        exercise: z.string().describe("Exercise name or template ID"),
        formula: z.enum(["epley", "brzycki"]).optional().describe("e1RM formula (default epley)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ exercise, formula }) => {
      const result = await getProgress(deps, { exercise, formula });
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
