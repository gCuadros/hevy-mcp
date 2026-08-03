# src/hevy — the Hevy API boundary

Everything that knows the Hevy API exists lives here. Nothing outside this directory
should reference a snake_case field, an `api-key` header, or a page number.

Read the root `AGENTS.md` first. This file only covers what is specific to this boundary.

## Layers

| File | Responsibility |
|---|---|
| `client.ts` | HTTP: auth header, retry/backoff, error mapping. Parses every response through a schema. |
| `schemas.ts` | zod schemas for the wire format. The contract with reality. |
| `adapter.ts` | Wire DTO → `Domain*` types. The only place snake_case becomes camelCase and ISO strings become `Date`. |
| `fetchAll.ts` | Pagination. Returns `Domain*`, already adapted. |
| `testFixtures.ts` | Fake clients for tool tests. Excluded from the published package by an explicit entry in `tsconfig.build.json` — it is test code that is not named `*.test.ts`, so it does not fall under that glob and had to be listed separately. |

Base URL is `https://api.hevyapp.com/v1`. Authentication is a single `api-key` header.
There are no scopes: one key grants everything the account can do.

## What the API actually does, versus what its docs claim

The schemas here were verified against a real account, and several of them disagree with
Hevy's published documentation. Do not "simplify" a schema to match the docs.

- **There is no `DELETE` endpoint anywhere in the API.** Anything created is permanent.
  This is the reason writes are structured the way they are — see the root `AGENTS.md`.
- **`rest_seconds` is an integer when you write it and a string when you read it back.**
  `restSecondsSchema` accepts both and normalises to a number. Narrowing it to
  `z.number()` would silently wipe the rest timers off every exercise on the next update.
- **Single-routine responses come back in three different shapes** — a bare routine,
  `{ routine: … }`, and `{ routine: [ … ] }` — depending on the endpoint.
  `routineResponseSchema` unwraps all three. This matters most after a write, where
  failing to parse a response would report an error for an operation that succeeded.
- **`rpe` is omitted entirely on routine sets**, rather than sent as `null` the way it is
  on workout sets. Hence the `.optional().transform()` in `routineSetSchema`.
- **The workout-events endpoint returns `{ workouts: [] }` instead of `{ events: [] }`**
  when there is nothing new. `workoutEventsPageSchema` normalises both to `events`.
- **`PUT /v1/routines/{id}` replaces the routine wholesale.** Anything missing from the
  body is erased. Updates must round-trip every stored field, which is what
  `toWritePayload` in `src/tools/write.ts` exists to do.
- The OpenAPI document is only reachable by parsing
  `https://api.hevyapp.com/docs/swagger-ui-init.js`; the `.json` URLs serve the Swagger UI
  HTML shell instead.
- Hevy does **not** offer OAuth to third parties. The `.well-known` discovery endpoints
  return 404. The OAuth in `src/auth/` is this server's own façade, not Hevy's.

## Retry policy

`MAX_RETRIES = 4`, exponential backoff of `2 ** attempt * 250` ms.

- **GET:** retried on 429 and any 5xx.
- **POST/PUT:** retried on 429 **only**. Never on 5xx. Hevy has no idempotency key and no
  delete, so a retried write that had actually landed leaves a duplicate the user cannot
  remove. This is deliberate; do not generalise the retry condition.
- **401/403:** never retried. Mapped to a message telling the user to regenerate the key
  in Hevy → Settings → API.

Rejected writes carry an explanation in an `{ error }` body, which `errorMessage()`
surfaces verbatim — that text is often the only clue about why Hevy refused.

## Pagination

`fetchAll.ts` walks pages until `page > page_count`. Page size is 10 for workouts and
routines (a Hevy limit) and 100 for exercise templates. There is no cache: every call
re-walks every page. That is the accepted design, not an oversight.

## Changing a schema

1. Change the schema and the adapter together — they are one boundary.
2. Add or update a case in `adapter.test.ts` using dirty, incomplete data. The real API
   sends nulls and missing keys in places the docs do not mention.
3. Run the smoke tests against a real key (`HEVY_API_KEY` in `.env.local`). A green
   `yarn test` without a key proves nothing about whether the schema still matches
   reality, because `client.smoke.test.ts` skips itself.
