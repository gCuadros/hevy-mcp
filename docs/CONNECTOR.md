# Connect your Hevy training log to Claude

`hevy-coach-mcp` is an [MCP](https://modelcontextprotocol.io/) server that gives an AI assistant read access to your [Hevy](https://www.hevyapp.com/) training history — and, more usefully, does the analytics math on top of it.

Without it, asking an assistant "did I get stronger on bench this mesocycle?" gets you a guess. With it, the assistant calls a tool that computes your estimated 1RM trend from every set you actually logged, and answers with numbers.

The split is deliberate: **the server computes, the assistant judges.** Every number — estimated 1RM, tonnage per muscle group, PRs, streaks, period-over-period deltas — is calculated in code and tested against fixtures. The assistant never does arithmetic on your training data; it interprets results it was handed.

**Requires Hevy PRO**, which is what unlocks Hevy's API.

## Two ways to connect

This is a standard MCP server speaking both of the protocol's transports, so it works with any MCP client. Only the config syntax differs.

| | Local (stdio) | Remote (hosted) |
|---|---|---|
| Where it runs | Your machine | A server you or someone else hosts |
| Your API key | An env var on your machine | Pasted once into a connect page |
| Transport | stdio | Streamable HTTP + OAuth 2.1 (PKCE) |
| Setup | One command | Click "Connect" |

Local is the simpler and more private option — nothing but Hevy ever sees your key. Remote exists for clients that run in a browser or in someone else's cloud and have no local process to spawn.

### Which one does your client need?

| Client | Local (stdio) | Remote (HTTP) |
|---|---|---|
| Claude Code | ✅ | ✅ |
| Claude Desktop | ✅ | ✅ |
| Claude.ai (web) | — | ✅ **only option** |
| ChatGPT | — | ✅ **only option** |
| OpenCode | ✅ | ✅ |
| Codex CLI | ✅ | ✅ |
| VS Code (Copilot) | ✅ | ✅ |
| Cursor | ✅ | ✅ |
| Windsurf | ✅ | ✅ |
| Zed, Cline, Goose, Gemini CLI, LibreChat… | ✅ | varies |

If your client can spawn a local process, use local — it's fewer moving parts and your key never leaves your machine. Browser-based assistants (Claude.ai, ChatGPT) can only do remote.

## Local setup

Get your API key from the Hevy app: **Settings → API**. Every example below is the same server started the same way; only the file and key names change.

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

### OpenCode

OpenCode uses its own shape — a `command` **array** and `environment` rather than `env`. Put this in `opencode.json` in your project, or `~/.config/opencode/opencode.json` for every project:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hevy": {
      "type": "local",
      "command": ["npx", "-y", "hevy-coach-mcp"],
      "enabled": true,
      "environment": { "HEVY_API_KEY": "your_key_here" }
    }
  }
}
```

Or run `opencode mcp add` and answer the prompts. Check it with `opencode mcp debug hevy`.

### Codex CLI

Codex uses TOML, in `~/.codex/config.toml` (shared by the CLI, the IDE extension and the desktop app):

```toml
[mcp_servers.hevy]
command = "npx"
args = ["-y", "hevy-coach-mcp"]
env = { HEVY_API_KEY = "your_key_here" }
```

A project-scoped `.codex/config.toml` also works, but only in projects you've marked trusted — otherwise Codex ignores it silently. Run `/mcp` in a session to confirm it connected.

### VS Code (GitHub Copilot)

`.vscode/mcp.json` in your workspace, or the user-level file via **MCP: Open User Configuration**. Note the top-level key is `servers`, not `mcpServers`, and `type` is required — VS Code does not infer the transport, so a config copied from Cursor or Claude Desktop will fail:

```json
{
  "servers": {
    "hevy": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "hevy-coach-mcp"],
      "env": { "HEVY_API_KEY": "your_key_here" }
    }
  }
}
```

### Any other MCP client

Whatever the config file is called, the three things it needs are always the same:

- **command:** `npx`
- **args:** `["-y", "hevy-coach-mcp"]`
- **env:** `HEVY_API_KEY=your_key_here`

That covers Zed (`context_servers`), Cline, Continue, Goose, Gemini CLI (`~/.gemini/settings.json`), LibreChat and anything else that implements MCP's stdio transport.

### Verify it worked

Ask the assistant to run `health-check`. It reports the connection status and how many workouts your account has. There is nothing to sync or warm up — every tool fetches live from Hevy.

## Remote setup

Replace `https://your-deployment.vercel.app` below with the URL of the deployment you're connecting to. The MCP endpoint is always that URL plus `/mcp`.

Authentication is OAuth 2.1 with PKCE and dynamic client registration, so clients that support OAuth handle it for you: the first request bounces you to a connect page, you paste your Hevy API key once, and the client stores the resulting token. The key is validated against Hevy immediately, so a typo fails right there rather than silently later.

### Claude.ai

**Settings → Connectors → Add custom connector**, then paste:

```
https://your-deployment.vercel.app/mcp
```

### ChatGPT

ChatGPT only accepts remote servers over public HTTPS — there is no way to point it at a local process, so the local setup above does not apply.

1. Enable **Developer mode**: **Settings → Apps / Connectors → Advanced settings → Developer mode**. (OpenAI has moved this toggle more than once; look under Connectors, Apps, or Security depending on your version.)
2. **Settings → Connectors → Add custom connector**, paste `https://your-deployment.vercel.app/mcp`, and authenticate when prompted.
3. Enable the connector in the chat where you want to use it — Developer Mode connectors are opt-in per conversation.

Worth knowing before you try:

- **Free accounts can't add custom connectors at all.** Plus and Pro can add read-only ones, which is exactly what this is. Business/Enterprise/Education additionally allow write-capable connectors, and an admin has to permit custom connectors first.
- **Deep Research mode won't see it.** ChatGPT's Deep Research only calls connector tools named `search` and `fetch`; this server exposes training-analytics tools instead. Use it in normal chat with Developer Mode on.

### Claude Code

```
claude mcp add --transport http hevy https://your-deployment.vercel.app/mcp
```

Then run `/mcp` and authenticate — the connect page opens in your browser.

### OpenCode

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hevy": {
      "type": "remote",
      "url": "https://your-deployment.vercel.app/mcp",
      "enabled": true
    }
  }
}
```

OpenCode performs dynamic client registration on its own; run `opencode mcp auth hevy` if it doesn't prompt you, and `opencode mcp auth list` to check the token status.

### Codex CLI

```toml
[mcp_servers.hevy]
url = "https://your-deployment.vercel.app/mcp"
```

Then `codex mcp login hevy` to run the OAuth flow.

### VS Code (GitHub Copilot)

```json
{
  "servers": {
    "hevy": {
      "type": "http",
      "url": "https://your-deployment.vercel.app/mcp"
    }
  }
}
```

### Clients that can't do OAuth

The `/mcp` endpoint accepts only OAuth access tokens issued by its own `/token` endpoint — you cannot paste your Hevy API key into an `Authorization: Bearer` header and skip the flow. If your client supports remote MCP but not OAuth, use the local setup instead.

### What the remote server stores about you

Nothing. Not your API key, not your workouts, not a session row.

Your Hevy API key is encrypted (AES-256-GCM) directly *into* your OAuth access token, and the token is held by your MCP client, not by the server. On each request the server decrypts your key out of the token you just sent, calls Hevy with it, and forgets it when the request ends. There is no database, no cache, and no vault — so there is nothing to breach and nothing to isolate between users.

Storing nothing has two consequences worth stating plainly rather than burying:

- **The authorization code is not single-use.** OAuth says a code must be redeemed once and then invalidated; doing that requires remembering which codes have been spent, and this server remembers nothing. The code is instead a sealed token that simply expires after 60 seconds. Within that window it could in principle be replayed — but only by someone who already intercepted it *and* holds the PKCE verifier that your client generated and never transmitted. PKCE is what actually protects this exchange; the single-use rule is a second lock on the same door.
- **The server's sealing key is a single point of failure.** Every token is encrypted with one key held in the deployment's environment. Anyone who obtains both that key and a live access token can read the Hevy API key inside it. There is no server-side revocation to fall back on, because there is no server-side record of your session — regenerating your API key in Hevy is the revocation mechanism, and it is immediate and total.

Neither of these is fixable without adding the database this design exists to avoid. If you'd rather not accept them, use the local setup: it has no server, no tokens and no sealing key at all.

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
