import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatToolResult } from "./format.js";
import { buildResources } from "./resources.js";
import {
  getExerciseHistory,
  getRoutine,
  getWorkout,
  getWorkouts,
  listRoutines,
  searchExercises,
  type ReadDeps,
} from "./tools/read.js";
import { runHealthCheck, runSync, type ToolDeps } from "./tools/sync.js";

type Deps = ToolDeps & ReadDeps;

/** Transport-agnostic McpServer: same instance is shared by stdio.ts and http.ts. */
export function createServer(deps: Deps): McpServer {
  const server = new McpServer({ name: "hevy-mcp", version: "0.0.0" });

  server.registerTool(
    "health-check",
    {
      title: "Health check",
      description:
        "Checks whether the Hevy API key is valid and reports how fresh the local cache is. Call this first when troubleshooting a connection issue, or before trusting analytics numbers.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await runHealthCheck(deps);
      return formatToolResult(`Hevy connection: ${result.status}`, result, result.status === "error");
    },
  );

  server.registerTool(
    "sync",
    {
      title: "Sync workouts cache",
      description:
        "Fetches the latest workouts, routines, folders and exercise templates from Hevy into the local cache. Run this if health-check reports a stale cache, before asking analytics questions.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const result = await runSync(deps);
        return formatToolResult(`Sync (${result.mode}): ${result.workoutsUpserted} upserted, ${result.workoutsDeleted} deleted`, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return formatToolResult(message, { message }, true);
      }
    },
  );

  server.registerTool(
    "get-workouts",
    {
      title: "Get workouts",
      description:
        "Lists cached workouts with a compact summary (title, dates, exercise/set counts), optionally filtered by date range. Use get-workout for full detail on a single one.",
      inputSchema: {
        from: z.string().optional().describe("ISO date/time lower bound (inclusive)"),
        to: z.string().optional().describe("ISO date/time upper bound (inclusive)"),
        limit: z.number().int().positive().optional().describe("Max results, most recent first (default 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const result = getWorkouts(deps, input);
      return formatToolResult(`Found ${result.workouts.length} workout(s)`, result);
    },
  );

  server.registerTool(
    "get-workout",
    {
      title: "Get workout",
      description: "Fetches full detail (all exercises and sets) for a single cached workout by ID.",
      inputSchema: { id: z.string().describe("Workout ID, from get-workouts or hevy://workouts/recent") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const workout = getWorkout(deps, { id });
      if (!workout) return formatToolResult(`Workout ${id} not found in cache`, { error: "not_found" }, true);
      return formatToolResult(workout.title, workout);
    },
  );

  server.registerTool(
    "list-routines",
    {
      title: "List routines",
      description: "Lists cached routines with a compact summary (title, folder, exercise count).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = listRoutines(deps);
      return formatToolResult(`Found ${result.routines.length} routine(s)`, result);
    },
  );

  server.registerTool(
    "get-routine",
    {
      title: "Get routine",
      description: "Fetches full detail (all exercises and target sets) for a single cached routine by ID.",
      inputSchema: { id: z.string().describe("Routine ID, from list-routines or hevy://routines") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const routine = getRoutine(deps, { id });
      if (!routine) return formatToolResult(`Routine ${id} not found in cache`, { error: "not_found" }, true);
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
      const result = searchExercises(deps, { query });
      return formatToolResult(`Found ${result.matches.length} match(es) for "${query}"`, result);
    },
  );

  server.registerTool(
    "get-exercise-history",
    {
      title: "Get exercise history",
      description:
        "Returns every set logged for a given exercise across cached workouts, most recent first. Accepts a human name or a template ID; if the name is ambiguous, returns candidates instead of guessing — call search-exercises or re-call with the exact ID.",
      inputSchema: {
        exercise: z.string().describe("Exercise name or template ID"),
        limit: z.number().int().positive().optional().describe("Max history entries, most recent first (default 20)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ exercise, limit }) => {
      const result = getExerciseHistory(deps, { exercise, limit });
      if (result.status === "not-found") {
        return formatToolResult(`No exercise found matching "${exercise}"`, result, true);
      }
      if (result.status === "ambiguous") {
        return formatToolResult(`"${exercise}" is ambiguous (${result.candidates.length} matches) — retry with an exact ID`, result, true);
      }
      return formatToolResult(`${result.history.length} session(s) for ${result.template.title}`, result);
    },
  );

  server.registerResource("profile", "hevy://profile", { title: "Cache profile", mimeType: "application/json" }, (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildResources(deps).profile) }],
  }));

  server.registerResource("routines", "hevy://routines", { title: "Cached routines", mimeType: "application/json" }, (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildResources(deps).routines) }],
  }));

  server.registerResource("exercises", "hevy://exercises", { title: "Cached exercise templates", mimeType: "application/json" }, (uri) => ({
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildResources(deps).exercises) }],
  }));

  server.registerResource(
    "stats-summary",
    "hevy://stats/summary",
    { title: "Cache stats summary", mimeType: "application/json" },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildResources(deps).statsSummary) }],
    }),
  );

  server.registerResource(
    "workouts-recent",
    "hevy://workouts/recent",
    { title: "10 most recent workouts", mimeType: "application/json" },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(buildResources(deps).recentWorkouts) }],
    }),
  );

  return server;
}
