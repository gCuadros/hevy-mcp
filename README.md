# hevy-coach-mcp

An MCP server for [Hevy](https://www.hevyapp.com/) (the workout tracking app). Read-only: it fetches your workouts, routines and exercise templates live from Hevy — no local cache or database — then does the analytics math (e1RM, PRs, volume, consistency, period comparisons) so your MCP client can reason over real numbers instead of guessing.

Requires **Hevy PRO** and a Hevy API key (Hevy app → Settings → API).

## Install

```
claude mcp add hevy -e HEVY_API_KEY=your_key_here -- npx hevy-coach-mcp
```

Or add it manually to your client's MCP config:

```json
{
  "mcpServers": {
    "hevy": {
      "command": "npx",
      "args": ["hevy-coach-mcp"],
      "env": { "HEVY_API_KEY": "your_key_here" }
    }
  }
}
```

This works in **Claude Desktop** (`claude_desktop_config.json`), **Claude Code** (`.mcp.json` or the command above), **Cursor** (`.cursor/mcp.json`), and **Windsurf** (`~/.codeium/windsurf/mcp_config.json`) — same shape everywhere.

Your API key stays local: it's read from the `HEVY_API_KEY` environment variable and never leaves your machine except in calls to Hevy's own API.

## First use

Run `health-check` any time to confirm the connection. Every other tool fetches live from Hevy — there's nothing to sync or warm up first.

## Tools

- `health-check` — connection status
- `get-workouts`, `get-workout` — list/inspect workouts
- `list-routines`, `get-routine` — list/inspect routines
- `search-exercises`, `get-exercise-history` — resolve an exercise by name and see its logged history
- `get-progress`, `get-records` — estimated-1RM trend and PRs (1/3/5/8RM) per exercise
- `get-volume-report` — effective sets and tonnage per muscle group per week
- `get-consistency` — training frequency, streak, longest gap
- `compare-periods` — volume/workout-count diff between two date ranges

## Resources

`hevy://profile`, `hevy://routines`, `hevy://exercises`, `hevy://stats/summary`, `hevy://workouts/recent` — cheap live snapshots for a client to read without a tool call.

## Prompts

`weekly-review`, `program-audit`, `deload-check`, `prepare-session` — guide the client through calling the right tools for common training questions.

## Privacy

Fully read-only: no tool writes anything, anywhere. Nothing about your account is stored — every tool call fetches fresh from Hevy's API using your own key, and nothing about your account is sent anywhere else.

## License

MIT
