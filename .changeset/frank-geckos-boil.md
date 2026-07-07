---
"hevy-coach-mcp": patch
---

Add a stateless Streamable HTTP transport (src/http.ts) alongside stdio. Internal groundwork only — still uses a single global HEVY_API_KEY and local SQLite, not yet reachable as a real remote connector until per-user OAuth (f5/oauth-vault) and Postgres (f5/postgres-store) land.
