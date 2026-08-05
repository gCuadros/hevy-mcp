---
"hevy-coach-mcp": patch
---

Fixed a bug in `log-body-measurement` that permanently destroyed thigh measurements.

Hevy's body-measurement record has `left_thigh` and `right_thigh` fields. This server did
not know about them, and that omission was not a missing feature — it was data loss. The
tool reads the stored entry and merges the new values over it, precisely so that logging a
weight does not wipe the body fat percentage recorded the same day. But the entry is
validated on the way in, and the two thigh fields were dropped there because no schema
declared them. Hevy's update endpoint nulls every field the payload leaves out, so anyone
with thigh measurements on a date lost them the moment they logged a weight for that date
— silently, and with no delete endpoint or undo to get them back.

Both fields are now read, written, preserved across an update, and accepted as inputs
(`leftThighCm`, `rightThighCm`). The schemas are pinned against Hevy's own OpenAPI
document by a test, so the next field they add fails a build instead of erasing data.

Two smaller fixes found alongside it:

- `get-progress` with `relativeToBodyweight` could attach an arbitrarily old weigh-in to a
  session. The check that a weigh-in is close enough in time failed open on a date it could
  not parse, rather than skipping it.
- `from` and `to` on `get-body-measurements` and `get-bodyweight-trend` are now validated
  as `YYYY-MM-DD`. They are compared as text, so a date written any other way did not
  error — it quietly matched nothing, and the answer came back as "no entries" for an
  account full of them.
