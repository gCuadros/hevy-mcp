---
"hevy-coach-mcp": minor
---

Add `create-routine` and `update-routine`. The connector can now build a plan in
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
