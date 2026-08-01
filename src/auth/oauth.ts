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

/**
 * Public CLI clients use loopback callbacks. Remote clients must return to an
 * origin explicitly approved by the deployment operator.
 */
function isAllowedRedirectUri(redirectUri: string, trustedHttpsOrigins: ReadonlySet<string>): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === "https:") return trustedHttpsOrigins.has(url.origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
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

/**
 * Self-contained HTML — no external assets, because the serverless function
 * serves no statics. Mobile-first: most people hit this inside the embedded
 * browser an AI client opens on a phone, so viewport meta and a >=16px input
 * (below that iOS Safari zooms on focus) matter more than they look like they do.
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
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f5f7; --card: #ffffff; --text: #16161a; --muted: #5f6169;
    --border: #d9dade; --accent: #16161a; --accent-text: #ffffff;
    --error-bg: #fdecec; --error-text: #a01b1b; --error-border: #f0b8b8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f0f11; --card: #1a1a1e; --text: #f2f2f4; --muted: #a0a2ab;
      --border: #33343a; --accent: #ffffff; --accent-text: #16161a;
      --error-bg: #3a1c1c; --error-text: #ffb4b4; --error-border: #5c2a2a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px;
    background: var(--bg); color: var(--text);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; justify-content: center;
  }
  main { width: 100%; max-width: 26rem; }
  .card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 14px; padding: 24px;
  }
  h1 { margin: 0 0 4px; font-size: 1.375rem; line-height: 1.3; }
  .sub { margin: 0 0 20px; color: var(--muted); font-size: 0.9375rem; }
  ol { margin: 0 0 20px; padding-left: 1.25rem; color: var(--muted); font-size: 0.9375rem; }
  li { margin-bottom: 6px; }
  li strong { color: var(--text); }
  label { display: block; font-weight: 600; font-size: 0.875rem; margin-bottom: 6px; }
  input[type="password"] {
    width: 100%; padding: 12px 14px;
    font-size: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--text); background: var(--bg);
    border: 1px solid var(--border); border-radius: 10px;
  }
  input[type="password"]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  button {
    width: 100%; margin-top: 16px; padding: 14px 16px;
    font-size: 1rem; font-weight: 600; font-family: inherit;
    color: var(--accent-text); background: var(--accent);
    border: 0; border-radius: 10px; cursor: pointer;
  }
   .error {
     margin: 0 0 20px; padding: 12px 14px; font-size: 0.9375rem;
     background: var(--error-bg); color: var(--error-text);
     border: 1px solid var(--error-border); border-radius: 10px;
   }
   .return-to { margin: 0 0 16px; font-size: 0.8125rem; line-height: 1.5; color: var(--muted); }
   .trust { margin: 16px 0 0; font-size: 0.8125rem; line-height: 1.5; color: var(--muted); }
   code { overflow-wrap: anywhere; }
   a { color: inherit; }
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>Connect your Hevy account</h1>
    <p class="sub">hevy-coach-mcp reads your training history so your AI assistant can do the analytics on it.</p>
    ${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ""}
    <ol>
      <li>Open Hevy (the app, or <a href="https://hevy.com/settings" target="_blank" rel="noopener noreferrer">hevy.com/settings</a>).</li>
      <li>Go to <strong>Settings &rarr; API</strong>. This needs <strong>Hevy PRO</strong>.</li>
      <li>Generate a key if you don't have one, copy it, and paste it below.</li>
    </ol>
    <p class="return-to">After connecting, you will return to <code>${escapeHtml(new URL(params.redirectUri).origin)}</code>. Only continue if you started this connection from a client you trust.</p>
    <form method="POST" action="/authorize">
      ${hidden}
      <label for="api_key">Hevy API key</label>
      <input type="password" id="api_key" name="api_key" required
             autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button type="submit">Connect</button>
    </form>
    <p class="trust">Your key is checked against Hevy, then encrypted into the access token your AI client
    holds. This server has no database and stores nothing &mdash; not your key, not your workouts. Access is
    read-only: nothing is ever written back to Hevy. To revoke it, regenerate your key in Hevy.</p>
  </div>
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
