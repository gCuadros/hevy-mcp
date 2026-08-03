# src/auth — OAuth façade and credential sealing

This directory handles other people's credentials. Everything in it is security-relevant;
nothing in it is a good place to be clever. Read the root `AGENTS.md` first.

## The design in one paragraph

Hevy does not offer OAuth to third parties, so this server is its own authorization
server. The user pastes their Hevy API key into a connect page; the key is validated
against Hevy immediately, then **encrypted into the OAuth tokens themselves** (JWE,
`alg: dir`, `enc: A256GCM`). There is no session store, no vault, no database. On each
request the server decrypts the key out of the bearer token it just received, calls Hevy,
and forgets it.

Revocation is the user regenerating their key in Hevy. That invalidates every token ever
issued to them, with no revocation list needed.

## Invariants

Breaking any of these is a security bug, not a style question.

- **PKCE S256 is mandatory.** `code_challenge_method=S256` is the only accepted value; a
  request without a challenge is rejected before anything else happens.
- **PKCE verification uses `timingSafeEqual`,** after a length check. Never `===`.
- **`redirect_uri` is checked against an allowlist, twice** — at `/authorize` and again at
  `/token`. HTTPS callbacks must match an origin in `OAUTH_TRUSTED_REDIRECT_ORIGINS`
  exactly; loopback (`localhost`, `127.0.0.1`, `[::1]`, any port) is always allowed
  because native clients per RFC 8252 bind whichever loopback family is available. Without
  this check the connector becomes an open redirect that harvests Hevy authorizations for
  arbitrary web apps.
- **`client_id` is compared against the one sealed in the code**, when the client sends
  one. Public clients using `token_endpoint_auth_method: "none"` may omit it; do not turn
  that into a hard requirement or conformant clients break.
- **Every interpolated value in the connect page goes through `escapeHtml`.** The page
  reflects `state`, `client_id` and `redirect_uri` straight back into hidden inputs.
- **Never log a key, a token, or a sealing key.** Not truncated, not hashed, not behind a
  debug flag.

## Token lifetimes

| Token | TTL | Carries |
|---|---|---|
| Authorization code | 60 s | Hevy API key, PKCE challenge, `client_id`, `redirect_uri` |
| Access token | 1 h | Hevy API key |
| Refresh token | 90 d | Hevy API key |

Sealing keys come from environment variables shaped `TOKEN_SEALING_KEY_<KID>`, each 32
bytes base64. `TOKEN_SEALING_ACTIVE_KID` (default `v1`) picks the one used to seal; all
loaded keys can still unseal, which is what makes rotation possible without invalidating
live tokens.

## Accepted weaknesses, documented on purpose

These are consequences of having no server-side state. They are disclosed to users in
`docs/CONNECTOR.md`, and that disclosure must stay accurate.

1. **Authorization codes are not single-use.** RFC 6749 §4.1.2 wants them consumed once;
   a stateless JWE cannot be. It is replayable within its 60-second window, and PKCE is
   the real lock. Fixing it properly requires storage, which would undo the entire design.
2. **The sealing key is a single point of failure.** If it leaks, every API key sealed
   into a live token can be decrypted, and there is no server-side revocation. The user
   regenerating their Hevy key is the only remedy.
3. **`POST /authorize` has no rate limit,** so it can be used as an oracle to test stolen
   Hevy keys. Known backlog item; there is nowhere to keep a counter in a stateless
   serverless function.

Do not quietly remove these notes from `docs/CONNECTOR.md`. If you fix one, delete the
disclosure in the same change.

## The connect page

`renderConnectPage` is a pure function returning a self-contained HTML string — no
external assets, because the serverless function serves no statics. It is mostly seen
inside the embedded browser an AI client opens **on a phone**, so the viewport meta tag
and the 16px input font (below that, iOS Safari zooms on focus) are load-bearing, not
decoration.

Its `form-action` CSP must name the client's callback origin, not just `'self'`.
Submitting the form posts to `/authorize`, which answers with a 302 to the callback, and
browsers apply `form-action` to every hop of that navigation including redirects. Chrome
reports the violation against `/authorize` instead of the redirect target, which makes a
same-origin POST look like it was refused by `'self'`. The origin has already been checked
against the allowlist before the page renders, so naming it costs nothing.

The page states what the connector does and does not do — specifically that it never logs
or edits workouts. That promise is enforced by there being no such tool. Keep them in sync.

## Verifying changes here

Unit tests are necessary and not sufficient. Build, run the server locally (see the root
`AGENTS.md`), and drive the real flow over HTTP: connect page renders, a bad key
re-renders with the error and the hidden fields intact, a good key redirects with `code`
and `state`, `/token` exchanges it, and `/mcp` accepts the resulting bearer while
rejecting a forged one.
