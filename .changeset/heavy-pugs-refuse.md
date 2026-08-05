---
"hevy-coach-mcp": minor
---

New `create-routine-folder` tool. The connector could already file a routine into a
folder by name, but only into one that already existed — asking for a new folder meant
leaving the conversation and making it by hand in the app.

A title that already exists is never created a second time: the existing folder comes
back instead. Hevy's API has no delete, so a duplicate would be permanent, and it would
make that name ambiguous from then on — `create-routine` refuses to guess between two
folders called the same thing, so neither of them could be used again.

Hevy puts every new folder at the top of the list, shifting the others down. That is the
API's behaviour, not a choice this server makes.
