---
"hevy-coach-mcp": minor
---

Bodyweight-relative analytics. `get-bodyweight-trend` reports how your weight has moved
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
