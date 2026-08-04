---
"hevy-coach-mcp": minor
---

New `list-routine-folders` tool, and `create-routine` now files a routine by folder
name instead of by numeric ID.

`create-routine` took a `folderId` number that nothing exposed, so a model had no way
to find a valid one. It now takes `folder`, a name or an ID, resolved with the same
contract as exercise and routine names: exact ID, exact title, single partial match,
otherwise the candidates come back and it asks. Resolution happens before anything is
sent, because Hevy's API cannot move a routine out of the wrong folder afterwards.
