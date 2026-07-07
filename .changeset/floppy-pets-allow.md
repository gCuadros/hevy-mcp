---
"hevy-coach-mcp": minor
---

The remote connector (src/http.ts) now has a real, stateless OAuth 2.1 + PKCE authorization server: /connect page to paste a Hevy API key (validated live, never stored), sealed authorization codes/access/refresh tokens, and /mcp gated behind a valid Bearer token. No server-side auth state anywhere. Cache storage is not yet multi-tenant safe — lands in f5/postgres-store.
