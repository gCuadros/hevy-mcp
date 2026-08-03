# CLAUDE.md

The instructions for this repository live in `AGENTS.md`, so that every agent — Claude
Code, Codex, Cursor, Copilot and anything else — reads the same thing. This file only
imports it.

@AGENTS.md

Some directories add local rules on top. Read the nested file when you work in one:

- `src/hevy/AGENTS.md` — the Hevy API boundary, and where its real behaviour differs from
  its documentation.
- `src/engine/AGENTS.md` — the pure analytics library and the rules that keep it testable.
- `src/auth/AGENTS.md` — OAuth, credential sealing, and the invariants that are security
  bugs to break.
