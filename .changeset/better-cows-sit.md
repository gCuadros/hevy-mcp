---
"hevy-coach-mcp": minor
---

Drop the persistent cache entirely (SQLite locally, the abandoned Postgres remote plan) — every tool now fetches live from Hevy's API on each call. Removes the `sync` tool (nothing to sync); `health-check` now just confirms the key works and reports Hevy's own live workout count. Breaking change to tool/resource output shapes (no more cache-freshness fields), acceptable pre-release.
