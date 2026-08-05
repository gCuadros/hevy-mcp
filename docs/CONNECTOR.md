# Connect your Hevy training log to Claude

`hevy-coach-mcp` is an [MCP](https://modelcontextprotocol.io/) server that gives an AI assistant read access to your [Hevy](https://www.hevyapp.com/) training history — and, more usefully, does the analytics math on top of it. It also writes back the things you tell it: routines, the folders they live in, a bodyweight. **It can never write a workout.** Your training log is the one thing it only ever reads, always.

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
| Setup | One command | Paste one URL |

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
claude mcp add hevy -e HEVY_API_KEY=your_key_here -- npx -y hevy-coach-mcp
```

### Claude Desktop

Edit `claude_desktop_config.json` (**Settings → Developer → Edit Config**):

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

Restart Claude Desktop.

Keep the `-y`. Without it, `npx` asks for confirmation before installing the package the first time, and it asks on stdin — which is the channel the MCP protocol is already using. The server looks like it hung instead of like it asked a question.

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

**The only thing you need is the URL.** Give your client `https://hevy-mcp-alpha.vercel.app/mcp` and it does the rest.

There is nothing to register, no client ID to obtain, no key to paste into a config file, and no setup on this end. Authentication is OAuth 2.1 with PKCE and [dynamic client registration](https://datatracker.ietf.org/doc/html/rfc7591), so a client that speaks OAuth registers itself, sends you to a connect page, and stores the token it gets back. You paste your Hevy API key once, on that page. It is checked against Hevy before the page accepts it, so a typo fails immediately instead of turning into a broken connector later.

That URL is the deployment maintained by this project. If you run [your own](#self-hosting), everything below is identical with your origin substituted — the MCP endpoint is always your origin plus `/mcp`.

### Claude.ai

**Settings → Connectors → Add custom connector**, then paste:

```
https://hevy-mcp-alpha.vercel.app/mcp
```

### ChatGPT

ChatGPT only accepts remote servers over public HTTPS — there is no way to point it at a local process, so the local setup above does not apply.

1. Enable **Developer mode**: **Settings → Apps / Connectors → Advanced settings → Developer mode**. (OpenAI has moved this toggle more than once; look under Connectors, Apps, or Security depending on your version.)
2. **Settings → Connectors → Add custom connector**, paste `https://hevy-mcp-alpha.vercel.app/mcp`, and authenticate when prompted.
3. Enable the connector in the chat where you want to use it — Developer Mode connectors are opt-in per conversation.

Worth knowing before you try:

- **Developer mode is not on every plan.** Which plans get it, and whether an admin has to enable it first under Settings → Permissions & Roles → Connected Data, is OpenAI's call and has changed more than once. If you can't find the toggle, that's the reason — nothing here will fix it.
- **The four write tools will ask before they run.** ChatGPT treats any tool without `readOnlyHint` as a write action and requires confirmation. `create-routine`, `update-routine`, `create-routine-folder` and `log-body-measurement` are declared as writes on purpose, so you get the prompt; the fourteen read tools don't.
- **Deep Research mode won't see it.** ChatGPT's Deep Research only calls connector tools named `search` and `fetch`; this server exposes training-analytics tools instead. Use it in normal chat with Developer Mode on.

### Claude Code

```
claude mcp add --transport http hevy https://hevy-mcp-alpha.vercel.app/mcp
```

Then run `/mcp` and authenticate — the connect page opens in your browser.

### OpenCode

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hevy": {
      "type": "remote",
      "url": "https://hevy-mcp-alpha.vercel.app/mcp",
      "enabled": true
    }
  }
}
```

OpenCode performs dynamic client registration on its own; run `opencode mcp auth hevy` if it doesn't prompt you, and `opencode mcp auth list` to check the token status.

### Codex CLI

```toml
[mcp_servers.hevy]
url = "https://hevy-mcp-alpha.vercel.app/mcp"
```

Then `codex mcp login hevy` to run the OAuth flow.

### VS Code (GitHub Copilot)

```json
{
  "servers": {
    "hevy": {
      "type": "http",
      "url": "https://hevy-mcp-alpha.vercel.app/mcp"
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

## Self-hosting

You do not need to host anything to use this connector — the section above works as-is. Host your own if you want the sealing key to be yours, or you want to run a modified build.

It's one Node process (Node 22+) with no database, no cache and no state, so it deploys anywhere that runs a Node HTTP server. On Vercel it needs no config file: the zero-config Node builder finds `src/server.ts` and wraps it. `yarn build && node dist/server.js` covers everything else.

### Environment variables

| Variable | When you need it | What it is |
|---|---|---|
| `TOKEN_SEALING_KEY_v1` | **Always** | 32 random bytes, base64: `openssl rand -base64 32`. Encrypts each user's Hevy key into their own tokens. |
| `PUBLIC_URL` | **Any deployment reachable from outside your machine** | The origin OAuth discovery advertises, no trailing slash — e.g. `https://hevy.example.com`. |
| `OAUTH_TRUSTED_REDIRECT_ORIGINS` | Only to support browser-based clients | Comma-separated HTTPS origins allowed as OAuth callbacks. |
| `TOKEN_SEALING_ACTIVE_KID` | Only to rotate the sealing key | Which key id seals new tokens. Defaults to `v1`. |
| `PORT` | Only if 3000 is taken | Port to bind. Vercel sets this itself — don't override it there. |

**A bad configuration does not stop the server; it stops every request.** The process binds the port and logs `hevy-coach-mcp listening on :3000` regardless, then answers `500` to everything — including `GET /`. A green deploy proves nothing. Send a request.

### `PUBLIC_URL`

This is the `issuer` in the discovery document and the base of every endpoint a client is told to visit. It is pinned to an environment variable rather than derived from the incoming `Host` header because that header is set by whoever sends the request: derived, a forged `Host` would hand a client a metadata document naming somebody else's authorization endpoints.

When `NODE_ENV=production` — which Vercel sets for you — the server refuses to answer without it. Outside production it falls back to the request's own host so that `localhost` development needs no configuration at all. **That fallback is for development only.** Reverse-proxied deployments that leave `NODE_ENV` unset are exactly where it hurts: nothing fails loudly, the issuer just quietly becomes whatever internal hostname the proxy passed through, and clients loop on an authorization endpoint that isn't reachable. Set `PUBLIC_URL` on anything with a public URL, whatever `NODE_ENV` says.

### `OAUTH_TRUSTED_REDIRECT_ORIGINS`

Optional, and empty by default. Empty is a working configuration — it just means only loopback clients can connect.

Loopback callbacks (`http://localhost`, `http://127.0.0.1` and `http://[::1]`, on any port) are **always** accepted and never belong in this list. That covers Claude Code, OpenCode, Codex CLI, VS Code and every other client that opens your own browser and catches the redirect on a local port.

Browser-based clients return to their own domain instead, and each one has to be named here or it is refused before the page that accepts a Hevy API key is ever rendered. To support the same clients as the maintained deployment:

```
OAUTH_TRUSTED_REDIRECT_ORIGINS=https://claude.ai,https://claude.com,https://chatgpt.com
```

Entries are scheme and host only. An entry carrying a path, or one that isn't HTTPS, is rejected — and since that check runs per request, it takes down the whole deployment rather than just that entry.

The point of the list is that a Hevy API key typed into your connect page can only ever be handed back to a destination you named. Don't add a domain you haven't confirmed belongs to the client you meant to support.

### Endpoints

Everything is served from one origin, so `PUBLIC_URL` is the only address you configure.

| Path | Method | Purpose |
|---|---|---|
| `/` | GET | Liveness. Returns `hevy-coach-mcp is running`. |
| `/.well-known/oauth-authorization-server` | GET | [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) metadata: issuer and endpoint URLs. |
| `/.well-known/oauth-protected-resource` | GET | [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) metadata, pointing `/mcp` at this authorization server. |
| `/register` | POST | Dynamic client registration. Issues a client id; registers nothing, since nothing is stored. |
| `/authorize` | GET, POST | GET renders the connect page; POST takes the API key and redirects with a code. |
| `/token` | POST | `authorization_code` and `refresh_token` grants. |
| `/mcp` | POST, GET, DELETE | The MCP endpoint (Streamable HTTP). Bearer token required on all three. |

Clients find all of this on their own: an unauthenticated `/mcp` request answers `401` with a `WWW-Authenticate` header naming the protected-resource metadata URL, and the client follows it from there. The only URL a user ever types is `/mcp`.

### Verifying a deployment

```bash
# 1. Alive, and the issuer is the origin you meant — not an internal hostname.
curl -s https://your-origin.example/.well-known/oauth-authorization-server

# 2. A loopback callback is accepted: 200, and an HTML page.
curl -s -o /dev/null -w '%{http_code}\n' 'https://your-origin.example/authorize?response_type=code&client_id=probe&code_challenge_method=S256&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&redirect_uri=http://localhost:9999/cb'

# 3. An origin you never approved is refused: 400.
curl -s -o /dev/null -w '%{http_code}\n' 'https://your-origin.example/authorize?response_type=code&client_id=probe&code_challenge_method=S256&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&redirect_uri=https://not-approved.example/cb'
```

If you approved browser clients, run step 2 again with each of their origins in `redirect_uri` and expect `200` from every one.

A `500` on step 1 means the configuration is wrong. The server logs which of the three it is: no sealing key, no `PUBLIC_URL` while `NODE_ENV=production`, or a malformed entry in the origins list.

## Things to ask it

- "Did I get stronger on bench press over the last 8 weeks?"
- "Which muscle groups am I under-training relative to the rest?"
- "Should I deload this week?"
- "What are my current PRs on the big lifts?"
- "How consistent have I been this year? What's my longest gap?"
- "Compare my volume this mesocycle to the previous one."
- "I'm training Push A today — what weights should I aim for?"
- "Audit my program. Is anything in my routines never actually getting trained?"
- "Log today's weigh-in: 73.4 kg."
- "My bench has stalled for a month — has my bodyweight moved in the same period?"
- "Am I cutting too fast? What's my rate per week?"
- "Am I actually getting stronger, or just heavier? Show my squat relative to bodyweight."

There are also four prompts (`weekly-review`, `program-audit`, `deload-check`, `prepare-session`) that walk the assistant through the right sequence of tool calls for these questions.

## What it can do

**Reading**
- `health-check` — connection status
- `get-workouts`, `get-workout` — list and inspect workouts
- `list-routines`, `get-routine` — list and inspect routines
- `list-routine-folders` — the folders you organise routines into
- `get-body-measurements` — bodyweight and measurements you've logged, newest first
- `search-exercises`, `get-exercise-history` — resolve an exercise by name, see everything you've logged for it

**Analytics**
- `get-progress` — estimated-1RM trend for an exercise over time, optionally against the bodyweight you were carrying at each session
- `get-records` — PRs at 1/3/5/8 reps
- `get-volume-report` — effective sets and tonnage per muscle group per week
- `get-consistency` — training frequency, current streak, longest gap
- `compare-periods` — volume and workout-count deltas between two date ranges
- `get-bodyweight-trend` — how your weight has moved over a range: total change, percentage, and rate per week

**Writing** — the only four tools that change anything, all declared as writes so your client asks first
- `create-routine` — build a new routine from exercise names, optionally straight into one of your folders
- `update-routine` — edit an existing routine; passing an exercise list replaces the old one outright
- `create-routine-folder` — add a folder to organise routines into. A title you already have is never created a second time, because Hevy can't delete the duplicate and the name would be ambiguous from then on
- `log-body-measurement` — record a bodyweight or a measurement for a date you state. Log a date twice and the metrics you gave are updated while everything else stored that day is kept — Hevy's own endpoint would have wiped it

You can name exercises and folders the way you actually say them ("incline bench", "RDL", "Cut Season"). If a name is ambiguous the server returns the candidates and asks rather than picking one for you — a wrong guess here would silently corrupt every number downstream, or file a routine somewhere Hevy's API can't move it back from.

## Where this is going

Everything above is what the connector does today; this section is direction, not a promise, and nothing here is built yet. It is here so you can see what the thing is trying to become before you decide to connect it.

- **Volume read against a cut or a bulk** instead of in isolation. Strength relative to bodyweight already landed — `get-bodyweight-trend`, and `get-progress` against the weight you were carrying — but tonnage and set counts are still reported as if your weight never moved.
- **More of what you already track in Hevy**, where it earns its place — the test being that you state the value and can see and correct it in the app.

What will not happen, at any point: writing workouts. Not behind a setting, not for corrections, not "just this once". Every number here is computed from your logged sets, and that only works if nothing but you can put them there.

## Limitations

- **Your training log is the line, and it does not move.** Four tools write to Hevy — routines, folders, body measurements — and no workout is ever logged, edited or deleted by any of them. That is deliberate and permanent: every number this connector gives you is computed from your logged sets, so a workout invented by an assistant wouldn't just dirty the record, it would move the trends you make decisions from, and you'd have no way to spot it. Your history changes only when you change it, in the app.
- **Nothing it creates can be deleted from here.** Hevy's API has no delete endpoint at all. A routine, folder or measurement created by mistake isn't destructive — nothing was overwritten — but you have to remove it by hand in the app.
- **It writes what you say, not what it infers.** The measurement tool records a number you stated and a date you gave; it is not allowed to estimate your weight from anything. If an assistant offers to "log roughly where you probably are", that's the assistant improvising, not the tool.
- **`update-routine` replaces, it does not merge.** Hevy only offers a whole-routine PUT. The server rebuilds the payload from what Hevy currently holds so an unrelated change can't flatten your rest timers or rep ranges, but if you pass a new exercise list it replaces the old one entirely. There is no undo.
- **Routine notes can be set but not preserved.** Hevy returns per-exercise notes on read but not routine-level ones, so an update that doesn't pass `notes` cannot carry over what was there.
- **Hevy PRO required.** The API is a PRO feature. There is no way around this.
- **Bodyweight-relative numbers are only as good as your weigh-ins.** A session is matched to the nearest weigh-in within two weeks, in either direction; sessions with nothing nearby come back with no bodyweight rather than an interpolated one, and the answer says how many were covered. Two weigh-ins are the minimum for a trend. If you don't weigh yourself in Hevy, these tools have nothing to work with — `log-body-measurement` is one way to start.
- **Estimated 1RM is estimated.** e1RM is computed with standard formulas (Epley/Brzycki) from your logged sets. It's a good trend line and a bad prediction of what you'd actually hit on the day.
- **Analytics over a long history takes a moment.** With no cache, a question that scans your whole training history re-fetches it, page by page, each time. On a multi-year account expect a few seconds. Questions about one exercise are the quick ones: those go straight to Hevy's per-exercise endpoint and come back in a single request.
- **Only what Hevy exposes.** RPE and notes are surfaced only where Hevy's API provides them, and body measurements are only as complete as what you've logged — most accounts have very few entries, or none.
- **No cross-question memory.** Two tool calls in the same conversation each fetch fresh. That's the cost of storing nothing.

## Privacy and revocation

Your API key gives full access to your Hevy account — Hevy issues one key with no scopes, so it can write as well as read regardless of what this connector chooses to do with it. Treat it accordingly.

**Local:** the key lives in your own MCP client config and is sent only to Hevy's API. It never reaches any server of ours, because there isn't one.

**Remote:** the key is never persisted — not in plaintext, not encrypted, not in a queue or a log. It exists only sealed inside your own access token and in memory for the duration of a request.

**To revoke access,** regenerate your API key in the Hevy app (**Settings → API**). That immediately kills every token ever issued against the old key, everywhere, with no action needed on the server side — the old key simply stops working at Hevy. For the local setup, delete the key from your MCP client config too.

## Source

[github.com/gCuadros/hevy-mcp](https://github.com/gCuadros/hevy-mcp) — MIT licensed. It is not affiliated with or endorsed by Hevy.
