import { randomUUID } from "node:crypto";
import {
  sealAccessToken,
  sealAuthorizationCode,
  sealRefreshToken,
  unsealAuthorizationCode,
  unsealRefreshToken,
  verifyPkce,
  type SealingKey,
} from "./token.js";

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
}

export interface AuthorizeError {
  error: string;
  errorDescription: string;
}

// RFC 8252 §7.3 tells clients to try both IPv4 and IPv6 loopback, so accepting
// only 127.0.0.1 would lock out a conformant CLI on a host where ::1 wins.
// `new URL()` keeps the brackets in `hostname` for IPv6 literals.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Public CLI clients use loopback callbacks. Remote clients must return to an
 * origin explicitly approved by the deployment operator.
 */
function isAllowedRedirectUri(redirectUri: string, trustedHttpsOrigins: ReadonlySet<string>): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === "https:") return trustedHttpsOrigins.has(url.origin);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function validateAuthorizeParams(
  params: AuthorizeParams,
  trustedHttpsOrigins: ReadonlySet<string>,
): AuthorizeParams | AuthorizeError {
  const { clientId, redirectUri, codeChallenge } = params;
  if (!clientId) return { error: "invalid_request", errorDescription: "Missing client_id" };
  if (!redirectUri || !isAllowedRedirectUri(redirectUri, trustedHttpsOrigins)) {
    return { error: "invalid_request", errorDescription: "redirect_uri is not approved for this connector" };
  }
  if (!codeChallenge) return { error: "invalid_request", errorDescription: "Missing code_challenge" };
  return params;
}

export function parseAuthorizeParams(query: URLSearchParams, trustedHttpsOrigins: ReadonlySet<string>): AuthorizeParams | AuthorizeError {
  if (query.get("response_type") !== "code") {
    return { error: "unsupported_response_type", errorDescription: "Only response_type=code is supported" };
  }
  if (query.get("code_challenge_method") !== "S256") {
    return { error: "invalid_request", errorDescription: "Only code_challenge_method=S256 is supported" };
  }

  return validateAuthorizeParams(
    {
      clientId: query.get("client_id") ?? "",
      redirectUri: query.get("redirect_uri") ?? "",
      codeChallenge: query.get("code_challenge") ?? "",
      state: query.get("state") ?? undefined,
    },
    trustedHttpsOrigins,
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Three rising bars, drawn inline rather than linked: the function serves no statics, and a
// page asking for a credential should not look like it was thrown together in a text editor.
const BRAND_MARK = `<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" role="img" aria-label="Hevy Coach"><rect x="1" y="10" width="4" height="7" rx="1"/><rect x="7" y="6" width="4" height="11" rx="1"/><rect x="13" y="1" width="4" height="16" rx="1"/></svg>`;

// Same mark as the favicon. A data URI keeps it inline; without it the embedded browser an AI
// client opens shows a blank default icon next to a form asking for an API key.
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="#16161a"><rect x="1" y="10" width="4" height="7" rx="1"/><rect x="7" y="6" width="4" height="11" rx="1"/><rect x="13" y="1" width="4" height="16" rx="1"/></svg>`,
)}`;

/**
 * Self-contained HTML — no external assets, because the serverless function
 * serves no statics. Mobile-first: most people hit this inside the embedded
 * browser an AI client opens on a phone, so viewport meta and a >=16px input
 * (below that iOS Safari zooms on focus) matter more than they look like they do.
 *
 * This page is also the only place a non-technical Hevy user sees what the server does
 * before handing over a key, so it carries the payoff and the guarantees, not just the form.
 */
export function renderConnectPage(params: AuthorizeParams, errorMessage?: string): string {
  const hidden = [
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["code_challenge", params.codeChallenge],
    ["state", params.state ?? ""],
  ]
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value ?? "")}">`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect your Hevy account</title>
<link rel="icon" href="${FAVICON}">
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f6f8; --glow: rgba(22, 22, 26, 0.05);
    --card: #ffffff; --field: #fafafb;
    --text: #16161a; --muted: #62646d; --faint: #8b8d96;
    --border: #e3e4e8; --rule: #edeef1;
    --accent: #16161a; --accent-text: #ffffff; --accent-hover: #2c2c33;
    --ring: rgba(22, 22, 26, 0.16);
    --shadow: 0 1px 2px rgba(16, 17, 22, 0.05), 0 8px 24px -12px rgba(16, 17, 22, 0.18);
    --error-bg: #fdf0f0; --error-text: #96201f; --error-border: #f2c4c4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d0d0f; --glow: rgba(255, 255, 255, 0.04);
      --card: #17171b; --field: #101013;
      --text: #f3f3f5; --muted: #9fa1aa; --faint: #74767f;
      --border: #2c2d33; --rule: #26272c;
      --accent: #f3f3f5; --accent-text: #16161a; --accent-hover: #ffffff;
      --ring: rgba(243, 243, 245, 0.22);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px -16px rgba(0, 0, 0, 0.7);
      --error-bg: #2e1717; --error-text: #ffb3b3; --error-border: #4d2525;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 16px; min-height: 100dvh;
    background: var(--bg);
    /* A single soft light source behind the card. Flat fills read as unfinished at this size. */
    background-image: radial-gradient(60rem 30rem at 50% -10%, var(--glow), transparent 70%);
    color: var(--text);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    display: flex; align-items: center; justify-content: center;
  }
  main { width: 100%; max-width: 27rem; }
  .card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 28px 24px; box-shadow: var(--shadow);
  }
  .brand { display: flex; align-items: center; gap: 7px; margin-bottom: 20px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); }
  .brand svg { display: block; color: var(--text); }
  h1 { margin: 0 0 6px; font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.021em; text-wrap: balance; }
  .sub { margin: 0 0 16px; color: var(--muted); font-size: 0.9375rem; }
  /* The asks do the job the README does for developers: show the payoff before asking
     for a credential. Quoted because they are meant to be read as things you would type. */
  .asks { margin: 0 0 24px; padding: 0 0 0 14px; list-style: none; border-left: 2px solid var(--rule); }
  .asks li { margin-bottom: 7px; font-size: 0.9375rem; line-height: 1.45; color: var(--muted); }
  .asks li:last-child { margin-bottom: 0; }
  /* Counter chips instead of the default markers: the three steps are the only instructions
     on the page, and plain list numbers make them look like fine print. */
  ol { counter-reset: step; margin: 0 0 24px; padding: 0; list-style: none; }
  ol li { counter-increment: step; position: relative; margin-bottom: 10px; padding-left: 30px; font-size: 0.9375rem; color: var(--muted); }
  ol li:last-child { margin-bottom: 0; }
  ol li::before {
    content: counter(step); position: absolute; left: 0; top: 1px;
    width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.6875rem; font-weight: 700; font-variant-numeric: tabular-nums;
    color: var(--accent-text); background: var(--accent);
  }
  li strong { color: var(--text); font-weight: 600; }
  form { margin: 0; }
  label { display: block; font-weight: 600; font-size: 0.8125rem; letter-spacing: 0.01em; margin-bottom: 7px; }
  input[type="password"] {
    width: 100%; padding: 13px 14px;
    font-size: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.02em;
    color: var(--text); background: var(--field);
    border: 1px solid var(--border); border-radius: 10px;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input[type="password"]::placeholder { color: var(--faint); letter-spacing: 0; }
  input[type="password"]:focus {
    outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring);
  }
  button {
    width: 100%; padding: 14px 16px;
    font-size: 0.9375rem; font-weight: 600; font-family: inherit; letter-spacing: 0.01em;
    color: var(--accent-text); background: var(--accent);
    border: 0; border-radius: 10px; cursor: pointer;
    transition: background-color 0.15s, transform 0.05s;
  }
  button:hover { background: var(--accent-hover); }
  button:active { transform: translateY(1px); }
  button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
  .error {
    margin: 0 0 20px; padding: 12px 14px; font-size: 0.875rem; line-height: 1.45;
    background: var(--error-bg); color: var(--error-text);
    border: 1px solid var(--error-border); border-radius: 10px;
  }
  .return-to { margin: 12px 0 16px; font-size: 0.75rem; line-height: 1.5; color: var(--faint); }
  /* Split rather than a checklist: "never writes a workout" is the strongest thing this
     server can say, and a tick next to it reads as a feature instead of a boundary. */
  .facts { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--rule); display: grid; gap: 16px; }
  .facts h2 { margin: 0 0 6px; font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); }
  .facts ul { margin: 0; padding: 0; list-style: none; }
  .facts li { margin-bottom: 4px; font-size: 0.8125rem; line-height: 1.5; color: var(--muted); }
  .facts li:last-child { margin-bottom: 0; }
  .trust { margin: 20px 0 0; padding-top: 16px; border-top: 1px solid var(--rule); font-size: 0.75rem; line-height: 1.5; color: var(--faint); }
  footer { margin: 18px 0 0; text-align: center; font-size: 0.75rem; color: var(--faint); }
  footer a { text-decoration: none; border-bottom: 1px solid var(--border); }
  footer a:hover { color: var(--text); border-bottom-color: var(--muted); }
  code { overflow-wrap: anywhere; font-size: 0.9em; }
  a { color: inherit; }
  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; }
    button:active { transform: none; }
  }
  @media (min-width: 30rem) { .card { padding: 32px; } }
</style>
</head>
<body>
<main>
  <div class="card">
    <div class="brand">${BRAND_MARK}Hevy Coach</div>
    <h1>Connect your Hevy account</h1>
    <p class="sub">Your assistant does the reasoning, this server does the maths. Once connected you can ask:</p>
    <ul class="asks">
      <li>&ldquo;How has my bench press moved over the last three months?&rdquo;</li>
      <li>&ldquo;Am I getting stronger, or just heavier?&rdquo;</li>
      <li>&ldquo;Build next week's push day and put it in Hevy.&rdquo;</li>
    </ul>
    ${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ""}
    <ol>
      <li>Open Hevy (the app, or <a href="https://hevy.com/settings" target="_blank" rel="noopener noreferrer">hevy.com/settings</a>).</li>
      <li>Go to <strong>Settings &rarr; API</strong>. This needs <strong>Hevy PRO</strong>.</li>
      <li>Generate a key if you don't have one, copy it, and paste it below.</li>
    </ol>
    <form method="POST" action="/authorize">
      ${hidden}
      <label for="api_key">Hevy API key</label>
      <input type="password" id="api_key" name="api_key" required placeholder="Paste your key here"
             autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <p class="return-to">After connecting, you will return to <code>${escapeHtml(new URL(params.redirectUri).origin)}</code>. Only continue if you started this connection from a client you trust.</p>
      <button type="submit">Connect</button>
    </form>
    <div class="facts">
      <section>
        <h2>What it does</h2>
        <ul>
          <li>Reads your training history, routines and measurements.</li>
          <li>Writes only what you dictate: routines, the folders they sit in, a bodyweight or a measurement.</li>
        </ul>
      </section>
      <section>
        <h2>What it never does</h2>
        <ul>
          <li><strong>Logs or edits a workout.</strong> The record every number is computed from cannot be altered by it.</li>
          <li>Stores anything. There is no database &mdash; not your key, not your workouts.</li>
        </ul>
      </section>
    </div>
    <p class="trust">Your key is checked against Hevy, then encrypted into the access token your AI client holds.
    To revoke access, regenerate your key in Hevy &rarr; Settings &rarr; API.</p>
  </div>
  <footer>Open source, MIT &middot; <a href="https://github.com/gCuadros/hevy-mcp" target="_blank" rel="noopener noreferrer">read what it does with your key</a></footer>
</main>
</body>
</html>`;
}

export interface ConnectSubmission {
  apiKey: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
}

export interface OAuthDeps {
  validateApiKey: (apiKey: string) => Promise<boolean>;
  keys: SealingKey[];
  activeKid: string;
}

export async function handleConnectSubmit(
  submission: ConnectSubmission,
  deps: OAuthDeps,
): Promise<{ redirectTo: string } | { renderError: string }> {
  const ok = await deps.validateApiKey(submission.apiKey);
  if (!ok) return { renderError: "That API key didn't work against Hevy. Check it and try again." };

  const code = await sealAuthorizationCode(
    {
      sub: randomUUID(),
      hevyApiKey: submission.apiKey,
      codeChallenge: submission.codeChallenge,
      redirectUri: submission.redirectUri,
      clientId: submission.clientId,
    },
    deps.keys,
    deps.activeKid,
  );

  const redirectTo = new URL(submission.redirectUri);
  redirectTo.searchParams.set("code", code);
  if (submission.state) redirectTo.searchParams.set("state", submission.state);
  return { redirectTo: redirectTo.toString() };
}

export interface TokenRequestBody {
  grantType: string | undefined;
  code: string | undefined;
  codeVerifier: string | undefined;
  redirectUri: string | undefined;
  refreshToken: string | undefined;
  clientId: string | undefined;
}

export interface TokenSuccess {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

export interface TokenErrorResponse {
  error: string;
  error_description: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 3600;

export async function handleTokenRequest(
  body: TokenRequestBody,
  keys: SealingKey[],
  activeKid: string,
): Promise<TokenSuccess | TokenErrorResponse> {
  if (body.grantType === "authorization_code") {
    if (!body.code || !body.codeVerifier || !body.redirectUri) {
      return { error: "invalid_request", error_description: "Missing code, code_verifier, or redirect_uri" };
    }
    let codePayload;
    try {
      codePayload = await unsealAuthorizationCode(body.code, keys);
    } catch {
      return { error: "invalid_grant", error_description: "Authorization code is invalid or expired" };
    }
    if (!verifyPkce(body.codeVerifier, codePayload.codeChallenge)) {
      return { error: "invalid_grant", error_description: "code_verifier does not match code_challenge" };
    }
    if (body.redirectUri !== codePayload.redirectUri) {
      return { error: "invalid_grant", error_description: "redirect_uri does not match the authorization request" };
    }
    // Only checked when sent: public clients authenticating with "none" may omit client_id
    // (RFC 6749 §3.2.1 requires it only for unauthenticated clients), and rejecting a
    // conformant client would cost more than the binding this adds.
    if (body.clientId !== undefined && body.clientId !== codePayload.clientId) {
      return { error: "invalid_grant", error_description: "client_id does not match the authorization request" };
    }

    const { sub, hevyApiKey } = codePayload;
    const [accessToken, refreshToken] = await Promise.all([
      sealAccessToken({ sub, hevyApiKey }, keys, activeKid, ACCESS_TOKEN_TTL_SECONDS),
      sealRefreshToken({ sub, hevyApiKey }, keys, activeKid),
    ]);
    return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: refreshToken };
  }

  if (body.grantType === "refresh_token") {
    if (!body.refreshToken) return { error: "invalid_request", error_description: "Missing refresh_token" };
    let refreshPayload;
    try {
      refreshPayload = await unsealRefreshToken(body.refreshToken, keys);
    } catch {
      return { error: "invalid_grant", error_description: "Refresh token is invalid or expired" };
    }
    const { sub, hevyApiKey } = refreshPayload;
    const accessToken = await sealAccessToken({ sub, hevyApiKey }, keys, activeKid, ACCESS_TOKEN_TTL_SECONDS);
    // Not rotated (see PLAN.md): same refresh token stays valid until its own expiry.
    return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token: body.refreshToken };
  }

  return { error: "unsupported_grant_type", error_description: `Unsupported grant_type: ${body.grantType ?? "(missing)"}` };
}
