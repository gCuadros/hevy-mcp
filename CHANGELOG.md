# Changelog

## 0.4.0

### Minor Changes

- 08e2b3a: Per-exercise questions now go through Hevy's dedicated exercise-history endpoint instead
  of downloading the whole training log and filtering it. That endpoint does not paginate —
  it returns an exercise's entire history in one response — so `get-exercise-history`,
  `get-progress` and `get-records` make one request where they used to make one per ten
  workouts. On a 128-workout account four such calls went from 5.2s to 2.0s, and the gap
  widens the longer you have been training.

  The numbers are unchanged: `get-progress` and `get-records` were checked against a real
  account before and after, and the output is byte-for-byte identical.

  `get-exercise-history` gains from the switch. Every session now carries the workout's
  title, every set carries its type (warmup, normal, failure, dropset), cardio sets carry
  distance and duration instead of coming back as empty rows, and `totalSessions` reports
  how many sessions exist regardless of the limit you asked for.

  One field changed shape: a set's `index` is now `order`. The history endpoint sends no set
  index, so this is the position the set came back in — the order it was logged — and it is
  named differently because it is derived here rather than reported by Hevy.

- fa769e0: New `create-routine-folder` tool. The connector could already file a routine into a
  folder by name, but only into one that already existed — asking for a new folder meant
  leaving the conversation and making it by hand in the app.

  A title that already exists is never created a second time: the existing folder comes
  back instead. Hevy's API has no delete, so a duplicate would be permanent, and it would
  make that name ambiguous from then on — `create-routine` refuses to guess between two
  folders called the same thing, so neither of them could be used again.

  Hevy puts every new folder at the top of the list, shifting the others down. That is the
  API's behaviour, not a choice this server makes.

- 176ce55: Body measurements: `get-body-measurements` reads what you've logged, `log-body-measurement`
  records a weight or a measurement for a date you state.

  This is the first write outside routines, so the promise on the connect page, in
  `docs/CONNECTOR.md` and in the README has been rewritten to say what is actually
  guaranteed. It was "routines are the only thing written", which described the tool list
  rather than the rule. The rule is: **your workout history is never written.** That is the
  line, it does not move, and everything else is only ever what you told the assistant to
  record.

  Logging a date that already has an entry updates the metrics you gave and keeps the rest
  of that day's record. Hevy's own endpoints make that harder than it sounds: `POST` answers
  409 once a date exists, and `PUT` nulls every field the payload leaves out, so logging a
  weigh-in would have silently wiped the body-fat percentage stored beside it. The stored
  entry is read and merged first, and the answer reports which metrics were preserved.

  Nothing is inferred: the tool records the number you stated, for the date you gave, and a
  call with a date and no measurement writes nothing at all rather than creating an empty
  entry that Hevy cannot delete.

- 29be242: Bodyweight-relative analytics. `get-bodyweight-trend` reports how your weight has moved
  over a range — total change, percentage, and rate per week — and `get-progress` accepts
  `relativeToBodyweight`, which attaches the weight you were carrying at each session and
  the e1RM as a multiple of it. `deload-check` now consults the weight trend too: strength
  that stalls while weight is dropping is a cut behaving normally, not fatigue, and reading
  it as fatigue is how a good cut gets deloaded for no reason.

  Weigh-ins are sparse by nature, so nothing is invented from them. A session is matched to
  the nearest weigh-in within a fortnight, looking forward as well as back, because someone
  who weighs in monthly has sessions no earlier weigh-in covers. Sessions with nothing in
  range come back with no bodyweight rather than an interpolated one, and the answer says
  how many of them there were. A range holding a single weigh-in has no trend: one weight is
  not a rate, and reporting zero would be a claim nobody made.

  `relativeToBodyweight` is opt-in rather than always on because measurements paginate ten
  to a page, and someone who weighs in daily would otherwise pay a second full walk of the
  API on every progress question that never mentioned their weight.

## 0.3.0

### Minor Changes

- 982319b: New `list-routine-folders` tool, and `create-routine` now files a routine by folder
  name instead of by numeric ID.

  `create-routine` took a `folderId` number that nothing exposed, so a model had no way
  to find a valid one. It now takes `folder`, a name or an ID, resolved with the same
  contract as exercise and routine names: exact ID, exact title, single partial match,
  otherwise the candidates come back and it asks. Resolution happens before anything is
  sent, because Hevy's API cannot move a routine out of the wrong folder afterwards.

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
