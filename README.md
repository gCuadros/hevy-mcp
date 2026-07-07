# hevy-coach-mcp

An MCP server for [Hevy](https://www.hevyapp.com/) (the workout tracking app). Read-only: it fetches your workouts, routines and exercise templates into a local cache, then does the analytics math (e1RM, PRs, volume, consistency, period comparisons) so your MCP client can reason over real numbers instead of guessing.

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

Your API key stays local: it's read from the `HEVY_API_KEY` environment variable and never leaves your machine except in calls to Hevy's own API. The cache is a local SQLite file (`hevy-mcp.sqlite` in the working directory, override with `HEVY_MCP_DB_PATH`).

## First use

Run `sync` once to pull your data into the local cache, then `health-check` any time to confirm the connection and see how fresh the cache is. Every other tool reads from the cache — re-run `sync` when you want fresh data.

## Tools

- `health-check`, `sync` — connection status and cache refresh
- `get-workouts`, `get-workout` — list/inspect cached workouts
- `list-routines`, `get-routine` — list/inspect cached routines
- `search-exercises`, `get-exercise-history` — resolve an exercise by name and see its logged history
- `get-progress`, `get-records` — estimated-1RM trend and PRs (1/3/5/8RM) per exercise
- `get-volume-report` — effective sets and tonnage per muscle group per week
- `get-consistency` — training frequency, streak, longest gap
- `compare-periods` — volume/workout-count diff between two date ranges

## Resources

`hevy://profile`, `hevy://routines`, `hevy://exercises`, `hevy://stats/summary`, `hevy://workouts/recent` — cheap cache snapshots for a client to read without a tool call.

## Prompts

`weekly-review`, `program-audit`, `deload-check`, `prepare-session` — guide the client through calling the right tools for common training questions.

## Privacy

Read-only in v1: the only tool that writes anything is `sync`, and it only writes to your own local cache. Nothing about your account is sent anywhere except direct calls to Hevy's API using your own key.

## License

MIT
