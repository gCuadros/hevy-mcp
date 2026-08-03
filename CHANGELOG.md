# Changelog

## 0.2.0

### Minor Changes

- d9da193: Drop the persistent cache entirely (SQLite locally, the abandoned Postgres remote plan) — every tool now fetches live from Hevy's API on each call. Removes the `sync` tool (nothing to sync); `health-check` now just confirms the key works and reports Hevy's own live workout count. Breaking change to tool/resource output shapes (no more cache-freshness fields), acceptable pre-release.
- bf629f6: The remote connector (src/http.ts) now has a real, stateless OAuth 2.1 + PKCE authorization server: /connect page to paste a Hevy API key (validated live, never stored), sealed authorization codes/access/refresh tokens, and /mcp gated behind a valid Bearer token. No server-side auth state anywhere. Cache storage is not yet multi-tenant safe — lands in f5/postgres-store.
- f047638: Add `create-routine` and `update-routine`. The connector can now build a plan in
  Hevy instead of only describing one back to you.

  Deliberately narrow: routines are the only thing it writes. No workout is ever
  logged or edited, because your training log is what every number here is
  computed from — a set the model invents doesn't just dirty the record, it moves
  the trends you then make decisions with.

  - Exercise names are resolved before anything is sent. If one is ambiguous or
    unknown, nothing is written and you get the candidates back. Hevy's API has no
    DELETE, so a routine half-built from the names that happened to resolve would
    have to be cleaned up by hand.
  - `update-routine` rebuilds the payload from what Hevy currently holds, because
    Hevy only offers a whole-routine PUT. Renaming a routine can't silently flatten
    its rest timers or rep ranges. Passing a new exercise list still replaces the
    old one outright.
  - Writes are not retried on 5xx. With no idempotency key and no delete, retrying
    a create that actually landed would leave a duplicate you can't remove from
    here. 429 is still retried — nothing happened server-side.
  - Both tools declare themselves as writes (`readOnlyHint: false`, and
    `destructiveHint: true` on the update), so clients prompt before running them.

  The read-only promise on the connect page, `docs/CONNECTOR.md` and `README.md`
  has been replaced with what's actually true: routines can be written, your
  workout history cannot, and nothing can be deleted.

### Patch Changes

- 2e0bfa2: Fix the connect page's Content Security Policy blocking the very redirect that
  completes the connection. `form-action 'self'` covered the POST to `/authorize`
  but not its 302 back to the client's callback, because browsers apply the
  directive to every hop of the navigation. Chrome reports that violation against
  `/authorize` instead of the redirect target, which made it look like a
  same-origin POST was being refused by a policy that allows it. The connect page
  now names the callback origin in `form-action` — an origin already checked
  against the approved list before the page renders.
- 3275bec: Add a stateless Streamable HTTP transport (src/http.ts) alongside stdio. Internal groundwork only — still uses a single global HEVY_API_KEY and local SQLite, not yet reachable as a real remote connector until per-user OAuth (f5/oauth-vault) and Postgres (f5/postgres-store) land.
- 043585e: Add the token-sealing core for the remote connector's auth (src/auth/token.ts): JWE-sealed authorization codes/access/refresh tokens, no server-side auth state. Internal only — not yet wired to any HTTP endpoint (lands in f5/oauth-endpoints).
- 41bb8e6: Stop publishing test fixtures. `src/hevy/testFixtures.ts` holds fake Hevy clients used only by tests, but it is not named `*.test.ts`, so the build's exclude glob missed it and `dist/hevy/testFixtures.*` shipped to npm.
- 57f3a38: Make the remote connector usable by a first-time user, and unblock npm publishing.

  - Redesigned the OAuth connect page: mobile viewport (it's opened in an embedded
    browser on a phone, which is where it was worst), 16px input so iOS Safari
    doesn't zoom on focus, dark-mode support, numbered instructions for finding the
    API key in Hevy, and a plain statement of what happens to the key. Errors now
    render as a styled block that keeps the OAuth request intact for a retry.
  - `/token` now rejects an `authorization_code` grant whose `client_id` doesn't
    match the one the code was issued to. Public clients that omit `client_id`
    entirely are still accepted, as RFC 6749 allows.
  - Removed `"private": true` and added `prepublishOnly`, so `npx hevy-coach-mcp`
    — which the docs have always instructed — can actually work.
  - `build` now cleans `dist/` and excludes tests. The published tarball was
    carrying compiled tests and a stale `dist/store/` (database code from before
    the cache was removed) that no longer has any source.
  - Documented the two honest limits of the stateless design in `docs/CONNECTOR.md`:
    the authorization code is not single-use, and the sealing key is a single point
    of failure with no server-side revocation.
  - Restrict remote OAuth callbacks to deployment-approved origins, while keeping
    loopback callbacks for desktop and CLI MCP clients. The connect page now shows
    the approved return origin before accepting a Hevy API key.

- aae6fe3: Add `docs/CONNECTOR.md`: the public setup page for the connector, covering both the local (stdio) and hosted (OAuth) modes, with a client compatibility matrix and verified config for Claude Code, Claude Desktop, Claude.ai, ChatGPT, OpenCode, Codex CLI, VS Code, Cursor and Windsurf, plus a generic recipe for any other MCP client. Also documents example questions, per-client limitations, and how to revoke access. The README now links to it and mentions the hosted mode.
- 1c825c8: Fix the Vercel deployment, which never got past the build. Vercel picked its
  Node.js server builder for this project and looked for an entrypoint in the root
  or `src/`, so it never reached the `api/` directory the deployment was built
  around, and failed with _No entrypoint found_. Renaming `src/server.ts` out of
  the way had removed the file it used to latch onto, leaving it with nothing.

  The remote server is now a plain Node HTTP server in `src/server.ts` that opens
  the port at module load, which is exactly what Vercel detects. `src/http.ts`
  keeps all the routing and is still what the tests drive directly; `api/handler.ts`
  and `vercel.json` are gone. Run the remote server locally with
  `node dist/server.js` instead of `node dist/http.js`.

- 15ac503: Accept IPv6 loopback callbacks (`http://[::1]:PORT/…`) as an approved `redirect_uri`. RFC 8252 lets a CLI client bind either loopback family, so allowing only `127.0.0.1` locked out conformant clients on hosts where IPv6 wins.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0

### Minor Changes

- ac2d9aa: Add analytics tools (get-progress, get-records, get-volume-report, get-consistency, compare-periods) and MCP prompts (weekly-review, program-audit, deload-check, prepare-session). This completes v1 local: sync, cache, read tools, resources, and analytics are all wired into the stdio server.

### Patch Changes

- 404a2f1: Add analytics engine (e1RM, records, volume, consistency, compare) as a pure internal library. Not yet exposed as MCP tools — that lands once the read-tools branch (F3) is merged.
- 4c9b5fc: Add repo foundations: CLAUDE.md, gitignore, changesets, yarn, and the first Hevy API client with cache/sync.
