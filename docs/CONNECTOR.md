# Connect your Hevy training log to Claude

`hevy-coach-mcp` is an [MCP](https://modelcontextprotocol.io/) server that gives an AI assistant read access to your [Hevy](https://www.hevyapp.com/) training history — and, more usefully, does the analytics math on top of it.

Without it, asking an assistant "did I get stronger on bench this mesocycle?" gets you a guess. With it, the assistant calls a tool that computes your estimated 1RM trend from every set you actually logged, and answers with numbers.

The split is deliberate: **the server computes, the assistant judges.** Every number — estimated 1RM, tonnage per muscle group, PRs, streaks, period-over-period deltas — is calculated in code and tested against fixtures. The assistant never does arithmetic on your training data; it interprets results it was handed.

**Requires Hevy PRO**, which is what unlocks Hevy's API.

## Two ways to connect

| | Local (stdio) | Remote (hosted) |
|---|---|---|
| Where it runs | Your machine | A server you or someone else hosts |
| Your API key | An env var on your machine | Pasted once into a connect page |
| Works with | Claude Code, Claude Desktop, Cursor, Windsurf | Claude.ai, Claude Code |
| Setup | One command | Click "Connect" |

Local is the simpler and more private option — nothing but Hevy ever sees your key. Remote exists so it works from claude.ai in the browser, where there is no local process to run.

## Local setup

Get your API key from the Hevy app: **Settings → API**.

### Claude Code

```
claude mcp add hevy -e HEVY_API_KEY=your_key_here -- npx hevy-coach-mcp
```

### Claude Desktop

Edit `claude_desktop_config.json` (**Settings → Developer → Edit Config**):

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

Restart Claude Desktop.

### Cursor

Same JSON, in `.cursor/mcp.json` (per project) or `~/.cursor/mcp.json` (global).

### Windsurf

Same JSON, in `~/.codeium/windsurf/mcp_config.json`.

### Verify it worked

Ask the assistant to run `health-check`. It reports the connection status and how many workouts your account has. There is nothing to sync or warm up — every tool fetches live from Hevy.

## Remote setup

Replace `https://your-deployment.vercel.app` below with the URL of the deployment you're connecting to.

### Claude.ai

**Settings → Connectors → Add custom connector**, then paste:

```
https://your-deployment.vercel.app/mcp
```

You'll be sent to a connect page, where you paste your Hevy API key once. The key is validated against Hevy immediately, so a typo fails right there rather than silently later.

### Claude Code

```
claude mcp add --transport http hevy https://your-deployment.vercel.app/mcp
```

Then run `/mcp` and authenticate — the same connect page opens in your browser.

### What the remote server stores about you

Nothing. Not your API key, not your workouts, not a session row.

Your Hevy API key is encrypted (AES-256-GCM) directly *into* your OAuth access token, and the token is held by your MCP client, not by the server. On each request the server decrypts your key out of the token you just sent, calls Hevy with it, and forgets it when the request ends. There is no database, no cache, and no vault — so there is nothing to breach and nothing to isolate between users.

## Things to ask it

- "Did I get stronger on bench press over the last 8 weeks?"
- "Which muscle groups am I under-training relative to the rest?"
- "Should I deload this week?"
- "What are my current PRs on the big lifts?"
- "How consistent have I been this year? What's my longest gap?"
- "Compare my volume this mesocycle to the previous one."
- "I'm training Push A today — what weights should I aim for?"
- "Audit my program. Is anything in my routines never actually getting trained?"

There are also four prompts (`weekly-review`, `program-audit`, `deload-check`, `prepare-session`) that walk the assistant through the right sequence of tool calls for these questions.

## What it can do

**Reading**
- `health-check` — connection status
- `get-workouts`, `get-workout` — list and inspect workouts
- `list-routines`, `get-routine` — list and inspect routines
- `search-exercises`, `get-exercise-history` — resolve an exercise by name, see everything you've logged for it

**Analytics**
- `get-progress` — estimated-1RM trend for an exercise over time
- `get-records` — PRs at 1/3/5/8 reps
- `get-volume-report` — effective sets and tonnage per muscle group per week
- `get-consistency` — training frequency, current streak, longest gap
- `compare-periods` — volume and workout-count deltas between two date ranges

You can name exercises the way you actually say them ("incline bench", "RDL"). If a name is ambiguous the server returns the candidates and asks rather than picking one for you — a wrong guess here would silently corrupt every number downstream.

## Limitations

- **Read-only.** Nothing is written back to Hevy — no routines created, no workouts logged, no edits. Every write in Hevy is irreversible and there's no delete endpoint, so writes are deliberately deferred until the read side has earned trust.
- **Hevy PRO required.** The API is a PRO feature. There is no way around this.
- **Estimated 1RM is estimated.** e1RM is computed with standard formulas (Epley/Brzycki) from your logged sets. It's a good trend line and a bad prediction of what you'd actually hit on the day.
- **Analytics over a long history takes a moment.** With no cache, a question that scans your whole training history re-fetches it, page by page, each time. On a multi-year account expect a few seconds.
- **Only what Hevy exposes.** Body measurements, RPE and notes are surfaced only where Hevy's API provides them.
- **No cross-question memory.** Two tool calls in the same conversation each fetch fresh. That's the cost of storing nothing.

## Privacy and revocation

Your API key gives read access to your Hevy account. Treat it accordingly.

**Local:** the key lives in your own MCP client config and is sent only to Hevy's API. It never reaches any server of ours, because there isn't one.

**Remote:** the key is never persisted — not in plaintext, not encrypted, not in a queue or a log. It exists only sealed inside your own access token and in memory for the duration of a request.

**To revoke access,** regenerate your API key in the Hevy app (**Settings → API**). That immediately kills every token ever issued against the old key, everywhere, with no action needed on the server side — the old key simply stops working at Hevy. For the local setup, delete the key from your MCP client config too.

## Source

[github.com/gCuadros/hevy-mcp](https://github.com/gCuadros/hevy-mcp) — MIT licensed. It is not affiliated with or endorsed by Hevy.
