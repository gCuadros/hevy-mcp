---
"hevy-coach-mcp": patch
---

List the server in the official MCP Registry. Adds the `mcpName` marker the registry
uses to prove the npm package is ours, plus a `server.json` manifest declaring both
installation paths — the npm package over stdio and the hosted endpoint over Streamable
HTTP — so directories that feed from the registry can pick either.
