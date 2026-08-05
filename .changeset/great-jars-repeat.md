---
"hevy-coach-mcp": minor
---

Per-exercise questions now go through Hevy's dedicated exercise-history endpoint instead
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
