---
"hevy-coach-mcp": patch
---

Add the token-sealing core for the remote connector's auth (src/auth/token.ts): JWE-sealed authorization codes/access/refresh tokens, no server-side auth state. Internal only — not yet wired to any HTTP endpoint (lands in f5/oauth-endpoints).
