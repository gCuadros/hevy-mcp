/** Compact MCP tool output: a one-line summary followed by structured JSON. */
export function formatToolResult(summary: string, data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: `${summary}\n${JSON.stringify(data)}` }],
    isError,
  };
}
