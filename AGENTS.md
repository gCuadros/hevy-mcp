# AGENTS.md

Instructions for AI coding agents working in this repository. This file is the single
source of truth; `CLAUDE.md` and `.github/copilot-instructions.md` only point back here.
Subdirectories with rules of their own carry a nested `AGENTS.md` — read it when you
touch that directory.

## What this project is

`hevy-coach-mcp` is an [MCP](https://modelcontextprotocol.io/) server that gives an AI
assistant access to a user's [Hevy](https://www.hevyapp.com/) training log, and computes
the analytics on top of it: estimated 1RM, PRs, volume per muscle group, consistency,
period-over-period comparison.

**The guiding principle, which explains most of the design: the server computes the
numbers, the model makes the judgements.** All arithmetic lives in `src/engine/` as a
pure library, tested against fixtures, with no I/O. The assistant never does maths on
training data — it interprets results it was handed. If you find yourself moving a
calculation into a tool description or expecting the model to add things up, you have
broken the core contract.

Requires Hevy PRO, which is what unlocks Hevy's API.

## Validate your changes

There is no linter and no formatter in this repo. `yarn lint` **does not exist** — do not
run it. A change is validated when all three of these pass:

```bash
yarn typecheck   # tsc --noEmit
yarn test        # vitest run
yarn build       # rm -rf dist && tsc -p tsconfig.build.json
```

Run all three before you call any task finished. CI (`.github/workflows/ci.yml`) runs
exactly the same three, then packs the tarball and asserts what is inside it: that
`dist/stdio.js` is present and still has its shebang, and that no compiled test or
`dist/store/` came along. That step needs nothing from you locally — it guards a mistake
that is invisible until someone opens the published package.

CI has a second job, `changeset`, which fails when a pull request adds no changeset. It
is **not** a required check, because docs-only and chore branches have nothing to
announce: add the changeset, or label the pull request `no-changeset`.

Two extra checks, only when relevant:

- **Touched `src/hevy/` schemas or client?** The real-API smoke tests
  (`src/hevy/client.smoke.test.ts`) verify the zod schemas against live Hevy responses.
  They skip themselves unless `HEVY_API_KEY` is set, so a green `yarn test` in CI proves
  nothing about them. Put a key in `.env.local` and re-run to actually exercise them.
- **Touched `src/http.ts` or `src/auth/`?** Unit tests do not prove the HTTP surface
  works. Build and drive it over real HTTP — see "Running the remote server locally".

## Package manager

**yarn classic (v1) only.** Never `npm`, never `npx`, never `pnpm`. Use `yarn add`,
`yarn <script>`. The `packageManager` field pins `yarn@1.22.22`.

The one exception is *documentation*: `docs/CONNECTOR.md` and `README.md` tell end users
to run `npx hevy-coach-mcp`, because that is how their MCP client launches the published
package. That is correct and should stay.

## Repo map

```
src/
  stdio.ts          bin entrypoint — local mode, API key from HEVY_API_KEY
  server.ts         HTTP entrypoint — opens the port (see the Vercel warning below)
  http.ts           request routing, OAuth endpoints, /mcp transport
  mcp-server.ts     transport-agnostic McpServer: every tool/resource/prompt is registered here
  config.ts         env loading for stdio mode
  format.ts         formatToolResult — the single output shape for every tool
  resources.ts      hevy:// resources (cheap live snapshots)
  prompts.ts        guided prompts (weekly-review, program-audit, deload-check, prepare-session)
  domain/types.ts   Domain* types — camelCase, real Date objects. The internal vocabulary.
  hevy/             Hevy API client, zod schemas, adapter, pagination      → nested AGENTS.md
  engine/           pure analytics: e1rm, volume, records, consistency,    → nested AGENTS.md
                    compare. No I/O, no clock, no network.
  auth/             OAuth 2.1 façade, token sealing, connect page          → nested AGENTS.md
  tools/            the MCP tools: read, analytics, write, health
docs/CONNECTOR.md   public setup page — the promises made to users live here
.changeset/         pending changelog entries
```

Data flows one way: `hevy/client` (raw DTOs, zod-validated) → `hevy/adapter` (Domain\*
types) → `engine/` (numbers) → `tools/` (tool results) → `mcp-server.ts` (registration).
Never let a raw Hevy DTO reach `engine/`, and never let `engine/` reach the network.

## Load-bearing decisions

Change these only with a deliberate reason, and update this file when you do.

### No cache, no database

Every tool that needs "all workouts / routines / templates" re-fetches them live from
Hevy, paginated, on every call (`src/hevy/fetchAll.ts`). Nothing is persisted anywhere,
in either transport.

An MCP server is asked a few questions a day, not polled continuously; Hevy already
solves storage and duplicating it buys nothing. The accepted cost is repeated pagination
across independent tool calls in one conversation, and slower analytics over long
histories. That is a trade-off, not a bug — do not "fix" it by adding a cache.

The way to make a tool faster is to ask Hevy a narrower question, not to remember the
answer. Everything about a single exercise — `get-exercise-history`, `get-progress`,
`get-records` — goes through `GET /v1/exercise_history/{id}`, which returns that
exercise's whole history unpaginated in one request, instead of walking every page of
every workout and filtering client-side. Same numbers, verified identical against a real
account; 2.7× faster on 128 workouts, and the gap widens with the log.

This is also what makes the hosted server multi-tenant-safe by construction: there is no
per-user state to isolate, because there is no state.

### The line is workout history, not writes in general

Fifteen read/analytics tools and four writes: `create-routine`, `update-routine`,
`create-routine-folder` and `log-body-measurement`.

**Workout history is never written.** That is the guarantee, and it is the only one. A
logged workout is the raw material for every number this server produces: a set the model
invents does not just dirty the record, it moves the e1RM curve, the PRs and the volume
trend the user then makes decisions from, and they have no way to tell. There is no
`create-workout` and there will not be one — not behind a flag, not "just for
corrections".

Everything else is fair game to write when it earns its place, and the surface is meant to
grow. Routines, folders and body measurements are all things the user states and the
server records; if a value is wrong the user can see it and fix it in the app, and no
analytic silently inherits the mistake. The old framing — "routines are the only thing
written" — was a description of what happened to exist, and it was read as a promise. Do
not reintroduce it.

What a new write must do before it lands:

1. Never touch workout history, directly or as a side effect.
2. Record only what the user actually stated. Inferring a value and writing it is the
   failure mode this whole section exists to prevent.
3. Resolve everything before sending anything, and survive Hevy having no DELETE — see
   below.
4. Update the public wording in the same branch: `renderConnectPage`
   (`src/auth/oauth.ts`), `docs/CONNECTOR.md` and `README.md`. Those texts are the promise
   users read before handing over a key, and a stale one is worse than no promise at all.

### Hevy's API has no DELETE

Nothing this server creates can ever be removed through the API — not by us, not by the
user, not by a cleanup script. Two consequences that are already implemented and must not
be regressed:

1. **Writes resolve everything before sending anything.** If one exercise name in a
   routine fails to resolve, nothing is written at all. A half-built routine would be
   worse than no routine, because the user would have to clean it up by hand. The same
   reasoning makes `create-routine-folder` refuse a title that already exists: a
   duplicate is permanent, and it would make that folder name ambiguous forever, so
   `create-routine` could never file anything into either copy again.
2. **Failed writes are never retried.** A 5xx on a POST/PUT might be a write that
   actually landed. Retrying could produce a duplicate routine that cannot be deleted.
   Only 429 is retried on writes, because it is rejected before doing anything.
3. **An update reads before it writes.** Hevy replaces wholesale: `PUT /v1/routines/{id}`
   erases anything missing from the body, and `PUT /v1/body_measurements/{date}` nulls
   every field the payload leaves out. Both round-trip the stored record first
   (`toWritePayload` and `logBodyMeasurement` in `src/tools/write.ts`), so setting one
   value cannot quietly wipe the rest of the entry.

### Ambiguity is never resolved by guessing

Every tool accepts human exercise and routine names and resolves the ID internally. When
a name matches more than one thing, the tool returns the candidates and asks — it does
not pick. A lucky guess corrupts every number downstream, and the user has no way to tell.

The resolution order is fixed: exact ID → exact title match → single partial match →
ambiguous. See `resolveExercise` in `src/tools/read.ts` and `resolveRoutine` in
`src/tools/write.ts`; new resolvers must follow the same contract.

### The Vercel entrypoint is fragile — do not "clean it up"

`src/server.ts` calls `listen()` at module load, deliberately **not** behind a
`import.meta.url === ...` main-module guard. Vercel's zero-config Node builder detects a
server by finding that call at load time; guarding it makes the whole deployment fail
with "No entrypoint found". This has already broken production once, when the file was
renamed. Leave the shape alone, and do not move or rename `src/server.ts`.

## Rules

### Always

- Give every new tool an `annotations` block. Reads are `readOnlyHint: true`; writes
  declare `readOnlyHint: false` explicitly, and destructive ones add
  `destructiveHint: true` so clients prompt for confirmation. ChatGPT treats *any* tool
  without `readOnlyHint` as a write requiring confirmation, so an omission is not neutral.
- Write **prescriptive** tool descriptions: say *when* to use the tool and when to prefer
  a different one, not just what it does. The description is the only thing the model
  sees before choosing.
- Return results through `formatToolResult` (`src/format.ts`) — a one-line summary plus
  compact JSON. Do not invent a second output shape.
- Validate every Hevy response through a zod schema in `src/hevy/schemas.ts`. The API
  documentation is not reliable; the schemas encode what the API actually returns.
- Add a changeset for any user-facing change (new tool, fix, breaking change):
  `yarn changeset`, then commit the generated file in `.changeset/`.
- Keep errors actionable. A 401 tells the user to regenerate their key in Hevy →
  Settings → API. Never fail silently.

### Never

- Never accept the Hevy API key as a tool argument. It arrives from the environment
  (stdio) or sealed inside the OAuth token (HTTP), and nowhere else.
- Never log an API key, a token, or a sealing key — not even truncated, not even in a
  debug branch.
- Never add a tool that writes workout history.
- Never edit `CHANGELOG.md` by hand; it is generated by `yarn run version` from changesets.
- Never commit directly to `main`.
- Never add an AI co-author trailer to a commit message. Commits in this repo carry no
  `Co-Authored-By` line for any assistant.
- Never return full history from a resource. Resources are cheap snapshots; filtered
  history belongs in a tool with arguments.

## Code conventions

TypeScript, strict, ESM. No linter enforces any of this, so match the surrounding code by
hand.

- **Imports of local files must carry the `.js` extension** (`./tools/read.js`), because
  `moduleResolution` is `NodeNext`. Omitting it compiles in your editor and fails at
  runtime.
- `exactOptionalPropertyTypes` is on: an optional property that can be absent *or*
  undefined must be written `foo?: T | undefined`, not `foo?: T`.
- `noUncheckedIndexedAccess` is on: `array[0]` is `T | undefined`. Narrow before use —
  the codebase uses `if (exact.length === 1 && exact[0])`, not a non-null assertion.
- Double quotes, semicolons, two-space indent. Lines run long (~140 columns is normal);
  do not reflow existing code to a narrower width.
- Named exports only. `export function`, `export interface`, `export type`.
- Comments explain **why**, not what. Most comments in this codebase document a decision
  or an API quirk that would otherwise look like a mistake — for example why a write is
  not retried, or why `rest_seconds` accepts two types. Match that density: a comment
  restating the code is noise, and a silently weird workaround is worse.
- Domain types (`src/domain/types.ts`) are camelCase with real `Date` objects. Hevy DTOs
  are snake_case with ISO strings. The boundary between them is `src/hevy/adapter.ts` and
  nowhere else.

## Testing

Vitest, colocated: `src/foo.ts` is tested by `src/foo.test.ts`.

- `src/engine/**` is tested against hand-calculated fixtures. If you change a formula, the
  expected value in the test must be worked out by hand, not copied from the new output.
- `src/hevy/adapter.test.ts` is fed dirty and incomplete data shaped like the real API's,
  because that is what the API actually sends.
- Tool tests use the fake clients in `src/hevy/testFixtures.ts`. `buildTestClient` serves
  reads; `buildWriteTestClient` also records every write body, so a test can assert what
  was sent **and** that nothing was sent when resolution failed.
- `*.smoke.test.ts` hits the real Hevy API and self-skips via `describe.skipIf` when
  `HEVY_API_KEY` is unset. Never make a normal test depend on the network.
- When a test fails, first ask whether the test or the code is wrong. Both happen here.

## Running it locally

**Local (stdio) mode** — needs `HEVY_API_KEY` in `.env.local`:

```bash
yarn build
export $(grep -v '^#' .env.local | xargs)
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"health-check","arguments":{}}}' \
  | node dist/stdio.js 2>/dev/null | tail -1
```

Swap `health-check` for any other tool and pass its arguments in `arguments`.

**Remote (HTTP) mode:**

```bash
yarn build
TOKEN_SEALING_KEY_v1=$(openssl rand -base64 32) PORT=3100 node dist/server.js
```

Then `GET /authorize?response_type=code&client_id=test&redirect_uri=http://localhost:9999/cb&code_challenge=<S256 of a verifier>&code_challenge_method=S256&state=abc`
renders the connect page. Routes are `/`, `/.well-known/oauth-authorization-server`,
`/.well-known/oauth-protected-resource`, `/register`, `/authorize` (GET and POST),
`/token`, `/mcp`.

See `.env.example` for every environment variable and what happens when it is missing.

## Git and release workflow

- One branch per unit of work, PR to `main`. Never commit to `main` directly.
- Add the changeset on the branch **right before it is ready to merge**, not while the
  work is still moving.
- `CHANGELOG.md` and the version bump are produced by **`yarn run version`** — with the
  `run`. `yarn version` without it is a yarn classic built-in that prompts for a version,
  rewrites `package.json`, *then* fires the `version` script as a lifecycle hook, so
  changesets bumps a second time and the git tag points at the wrong version. `yarn
  release` publishes and has no such collision.
- **Publishing to npm is the `Release` workflow**, run by hand from the Actions tab
  against `main`. It refuses to run while any changeset is still pending, so the order
  is: branch → `yarn run version` → PR → merge → run the workflow. Publishing from a
  laptop still works, but only CI can attach a provenance attestation.
- The versioning half is deliberately *not* automated. A "Version Packages" pull request
  opened by `GITHUB_TOKEN` does not trigger workflows, so the `verify` check that the
  `main` ruleset requires would never report and that pull request could never be
  merged. Changing this needs a PAT or a ruleset bypass, not just the changesets action.
- Deployment to Vercel is done manually by the maintainer. Do not run `vercel` commands.

## Files that are not in this repo

`PLAN.md` and `STATUS.md` are the maintainer's local working notebooks and are
deliberately gitignored. If they exist in your working copy they are useful context; if
they do not, nothing is missing and you should not recreate them. Everything an agent
needs is in this file and the nested `AGENTS.md` files.

## For humans and other tools

- **Claude Code** reads `CLAUDE.md`, which imports this file.
- **GitHub Copilot** reads `.github/copilot-instructions.md`, which points here.
- **Codex, Cursor, Gemini CLI, Jules and other AGENTS.md-aware agents** read this file
  directly, plus the nested ones as they enter those directories.

Keep it that way: put the content here, and leave the other files as pointers.
