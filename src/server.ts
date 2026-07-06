import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runHealthCheck, runSync, type ToolDeps } from "./tools/sync.js";

function textResult(payload: unknown, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], isError };
}

/** Transport-agnostic McpServer: same instance is shared by stdio.ts and http.ts. */
export function createServer(deps: ToolDeps): McpServer {
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
      return textResult(result, result.status === "error");
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
        return textResult(result);
      } catch (error) {
        return textResult({ message: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  return server;
}
