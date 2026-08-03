---
"hevy-coach-mcp": patch
---

Stop publishing test fixtures. `src/hevy/testFixtures.ts` holds fake Hevy clients used only by tests, but it is not named `*.test.ts`, so the build's exclude glob missed it and `dist/hevy/testFixtures.*` shipped to npm.
