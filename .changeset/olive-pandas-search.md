---
"hevy-coach-mcp": minor
---

Body measurements: `get-body-measurements` reads what you've logged, `log-body-measurement`
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
