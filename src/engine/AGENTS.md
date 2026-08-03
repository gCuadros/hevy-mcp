# src/engine — the analytics library

This is where the project's whole value sits: the numbers an assistant would otherwise
guess at. Read the root `AGENTS.md` first.

## The rules that make this directory work

**Pure functions only.** No network, no filesystem, no environment variables, no reading
the clock mid-computation. Every input arrives as an argument, including "now" when a
calculation needs it. A function that reads the clock cannot be tested, and consistency
and streak maths are exactly where an untestable clock hides bugs.

The one accepted form is a **default parameter** — `computeConsistency(startTimes, now: Date = new Date())`
in `consistency.ts`. It keeps callers convenient while letting every test pass an explicit
`now` and stay deterministic. That is the pattern to copy if a new function needs the
current time; a bare `new Date()` or `Date.now()` in the body is not.

**No I/O means no imports from `../hevy/` either.** This directory takes `Domain*` types
from `../domain/types.js` and returns plain numbers and objects. If you need a value that
only the API has, adapt it before it gets here.

**Fixtures are calculated by hand.** When you change a formula, work out the expected
value yourself and put that in the test. Copying the new output into the assertion turns
the test into a snapshot of a possible bug — and these tests are the only thing standing
between a rounding change and a user being told they got weaker.

**Every formula names its provenance.** `e1rm.ts` documents Epley as
`weight × (1 + reps/30)` and Brzycki as `weight × 36 / (37 - reps)`, including that
Brzycki is undefined at 37 reps or more. A new formula gets the same treatment: the
expression, where it comes from, and where it breaks down.

## Modules

| File | Computes |
|---|---|
| `e1rm.ts` | Estimated 1RM per set (Epley default, Brzycki available), and the best set of a session. |
| `muscle-map.ts` | `exercise_template_id` → primary muscle group, built from Hevy's own templates. `volume.ts` depends on it. There is no separately curated dataset, on purpose. |
| `records.ts` | PRs at 1/3/5/8 reps. |
| `volume.ts` | Effective sets and tonnage per muscle group per week. |
| `consistency.ts` | Training frequency, current streak, longest gap. |
| `compare.ts` | Volume and workout-count deltas between two date ranges. |

## Judgement belongs to the model

These functions return measurements, never advice. No thresholds for "enough volume", no
"you should deload", no letter grades. The server computes; the assistant interprets.
Putting a judgement in here bakes one coach's opinion into everybody's data, and hides it
where the user cannot see or argue with it.

A set that cannot be scored — no weight, no reps, zero either — is excluded, not
defaulted to zero. Zero is a claim about the training; absence is the truth.
