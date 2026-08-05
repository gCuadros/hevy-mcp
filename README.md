# hevy-coach-mcp

An MCP server for [Hevy](https://www.hevyapp.com/) (the workout tracking app). It fetches your workouts, routines and exercise templates live from Hevy — no local cache or database — then does the analytics math (e1RM, PRs, volume, consistency, period comparisons) so your MCP client can reason over real numbers instead of guessing. It writes back what you ask it to — routines, folders, a bodyweight — and never touches your workout history.

Requires **Hevy PRO** and a Hevy API key (Hevy app → Settings → API).

## Install

```
claude mcp add hevy -e HEVY_API_KEY=your_key_here -- npx -y hevy-coach-mcp
```

Or add it manually to your client's MCP config:

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["-y", "hevy-coach-mcp"],
      "env": { "HEVY_API_KEY": "your_key_here" }
    }
  }
}
```

This works in **Claude Desktop** (`claude_desktop_config.json`), **Claude Code** (`.mcp.json` or the command above), **Cursor** (`.cursor/mcp.json`), and **Windsurf** (`~/.codeium/windsurf/mcp_config.json`) — same shape everywhere.

Your API key stays local: it's read from the `HEVY_API_KEY` environment variable and never leaves your machine except in calls to Hevy's own API.

There's also a hosted mode over Streamable HTTP with OAuth, for clients that can't spawn a
local process (Claude.ai, ChatGPT). Point them at `https://hevy-mcp-alpha.vercel.app/mcp`
and they'll run the OAuth flow themselves. [docs/CONNECTOR.md](docs/CONNECTOR.md) covers
both setups client by client, plus self-hosting, example questions and privacy details.

## First use

Run `health-check` any time to confirm the connection. Every other tool fetches live from Hevy — there's nothing to sync or warm up first.

## Tools

Fourteen read tools, all marked `readOnlyHint`:

- `health-check` — connection status
- `get-workouts`, `get-workout` — list/inspect workouts
- `list-routines`, `get-routine` — list/inspect routines
- `list-routine-folders` — the folders routines are organised into, with their IDs
- `search-exercises`, `get-exercise-history` — resolve an exercise by name and see its logged history
- `get-progress`, `get-records` — estimated-1RM trend and PRs (1/3/5/8RM) per exercise
- `get-volume-report` — effective sets and tonnage per muscle group per week
- `get-consistency` — training frequency, streak, longest gap
- `compare-periods` — volume/workout-count diff between two date ranges
- `get-body-measurements` — logged bodyweight and measurements, newest first

Four write tools, declared as writes so your client asks first:

- `create-routine` — build a new routine from exercise names, optionally into a folder named rather than numbered
- `update-routine` — edit an existing routine; passing an exercise list replaces the old one outright (`destructiveHint`)
- `create-routine-folder` — add a folder; a title that already exists is never created twice
- `log-body-measurement` — record a bodyweight or measurement for a date you give it; re-logging a date keeps whatever else was stored that day

## Resources

`hevy://profile`, `hevy://routines`, `hevy://exercises`, `hevy://stats/summary`, `hevy://workouts/recent` — cheap live snapshots for a client to read without a tool call.

## Prompts

`weekly-review`, `program-audit`, `deload-check`, `prepare-session` — guide the client through calling the right tools for common training questions.

## Privacy

Nothing about your account is stored — every tool call fetches fresh from Hevy's API using your own key, and nothing about your account is sent anywhere else.

Four tools write to Hevy: `create-routine`, `update-routine`, `create-routine-folder` and `log-body-measurement`, all declared as writes so your client asks before running them. **Nothing writes to your workout history** — that is the line, and it does not move: a logged workout is what every number here is computed from, so it can only be changed by you, in the app. Hevy's API has no delete endpoint, so nothing this server creates can be removed from here either. Note that a Hevy API key has no scopes — it grants full account access no matter what this server chooses to do with it.

## Contributing

Clone, `yarn install`, and copy `.env.example` to `.env.local`. Validate any change with
`yarn typecheck && yarn test && yarn build` — the same three commands CI runs.

[`AGENTS.md`](AGENTS.md) is the full guide to the architecture, conventions and the
decisions worth knowing before changing anything. It is written for AI coding agents, but
it is the fastest way for a human to get oriented too.

## License

MIT
