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

/** Public clients only (PKCE-secured); redirect_uri must be https or http://localhost to prevent open-redirect abuse. */
function isAllowedRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export function parseAuthorizeParams(query: URLSearchParams): AuthorizeParams | AuthorizeError {
  const responseType = query.get("response_type");
  const clientId = query.get("client_id");
  const redirectUri = query.get("redirect_uri");
  const codeChallenge = query.get("code_challenge");
  const codeChallengeMethod = query.get("code_challenge_method");
  const state = query.get("state") ?? undefined;

  if (responseType !== "code") return { error: "unsupported_response_type", errorDescription: "Only response_type=code is supported" };
  if (!clientId) return { error: "invalid_request", errorDescription: "Missing client_id" };
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return { error: "invalid_request", errorDescription: "redirect_uri must be https:// or http://localhost" };
  }
  if (!codeChallenge) return { error: "invalid_request", errorDescription: "Missing code_challenge" };
  if (codeChallengeMethod !== "S256") return { error: "invalid_request", errorDescription: "Only code_challenge_method=S256 is supported" };

  return { clientId, redirectUri, codeChallenge, state };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

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
<html><head><meta charset="utf-8"><title>Connect hevy-coach-mcp</title></head>
<body>
  <h1>Connect your Hevy account</h1>
  <p>Paste your Hevy API key (Hevy app → Settings → API). It is validated against Hevy, then sealed into your
  access token — this server does not store it anywhere.</p>
  ${errorMessage ? `<p style="color:red">${escapeHtml(errorMessage)}</p>` : ""}
  <form method="POST" action="/authorize">
    ${hidden}
    <input type="password" name="api_key" placeholder="Hevy API key" required>
    <button type="submit">Connect</button>
  </form>
</body></html>`;
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
