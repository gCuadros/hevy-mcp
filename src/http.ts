import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport, type StreamableHTTPServerTransportOptions } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authorizationServerMetadata, protectedResourceMetadata } from "./auth/metadata.js";
import {
  handleConnectSubmit,
  handleTokenRequest,
  parseAuthorizeParams,
  renderConnectPage,
  validateAuthorizeParams,
  type AuthorizeParams,
  type TokenRequestBody,
} from "./auth/oauth.js";
import { loadSealingKeys, unsealAccessToken, TokenError, type SealingKey } from "./auth/token.js";
import { HevyClient } from "./hevy/client.js";
import { createServer } from "./mcp-server.js";

const ACTIVE_KID = process.env.TOKEN_SEALING_ACTIVE_KID ?? "v1";
const MAX_FORM_BODY_BYTES = 16 * 1024;

class BodyTooLargeError extends Error {}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let length = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_FORM_BODY_BYTES) {
        if (!tooLarge) reject(new BodyTooLargeError("Request body is too large"));
        tooLarge = true;
        return;
      }
      data += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!tooLarge) resolve(data);
    });
    req.on("error", reject);
  });
}

function baseUrl(req: IncomingMessage): string {
  const envUrl = process.env.PUBLIC_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = req.headers.host ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  return `${proto}://${host}`;
}

function loadTrustedHttpsOrigins(env: NodeJS.ProcessEnv): Set<string> {
  const rawOrigins = env.OAUTH_TRUSTED_REDIRECT_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const origins = new Set<string>();
  for (const rawOrigin of rawOrigins) {
    const url = new URL(rawOrigin);
    if (url.protocol !== "https:" || url.origin !== rawOrigin.replace(/\/$/, "")) {
      throw new Error("OAUTH_TRUSTED_REDIRECT_ORIGINS entries must be HTTPS origins without a path");
    }
    origins.add(url.origin);
  }
  return origins;
}

/**
 * `form-action` has to name the client's callback origin, not just 'self'.
 * Submitting the connect form posts to /authorize, which answers 302 to the
 * client's redirect_uri, and browsers apply form-action to every hop of that
 * navigation — including the redirect. Chrome then reports the violation
 * against /authorize rather than the redirect target (it withholds the
 * destination to avoid leaking it), so the console blames a same-origin POST
 * that 'self' plainly allows. Granting the origin costs nothing: it has
 * already been checked against the approved list before this page renders.
 */
export function contentSecurityPolicy(formActionOrigin?: string): string {
  const formAction = formActionOrigin ? `'self' ${formActionOrigin}` : "'self'";
  return `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; base-uri 'none'; frame-ancestors 'none'`;
}

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-security-policy", contentSecurityPolicy());
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(html);
}

function sendConnectPage(res: ServerResponse, params: AuthorizeParams, errorMessage?: string): void {
  res.setHeader("content-security-policy", contentSecurityPolicy(new URL(params.redirectUri).origin));
  sendHtml(res, 200, renderConnectPage(params, errorMessage));
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await new HevyClient({ apiKey }).getWorkoutsCount();
    return true;
  } catch {
    return false;
  }
}

/**
 * Bearer-token gated MCP endpoint. No cache, no database — every tool call
 * fetches live from Hevy using the authenticated user's own key (sealed in
 * their access token). Multi-tenant safe by construction: nothing is
 * persisted anywhere on this server, so there's no tenant data to isolate.
 */
async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, hevyApiKey: string): Promise<void> {
  const client = new HevyClient({ apiKey: hevyApiKey });
  const server = createServer({ client });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined } as unknown as StreamableHTTPServerTransportOptions);

  res.on("close", () => {
    void server.close();
    void transport.close();
  });

  await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
  await transport.handleRequest(req, res);
}

function unauthorized(res: ServerResponse, resourceMetadataUrl: string): void {
  res
    .writeHead(401, {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    })
    .end(JSON.stringify({ error: "invalid_token" }));
}

async function route(req: IncomingMessage, res: ServerResponse, keys: SealingKey[], trustedHttpsOrigins: ReadonlySet<string>): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const base = baseUrl(req);

  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "content-type": "text/plain" }).end("hevy-coach-mcp is running");
    return;
  }

  if (url.pathname === "/.well-known/oauth-authorization-server" && req.method === "GET") {
    sendJson(res, 200, authorizationServerMetadata(base));
    return;
  }

  if (url.pathname === "/.well-known/oauth-protected-resource" && req.method === "GET") {
    sendJson(res, 200, protectedResourceMetadata(base));
    return;
  }

  if (url.pathname === "/register" && req.method === "POST") {
    const raw = await readBody(req);
    let clientMetadata: Record<string, unknown> = {};
    try {
      clientMetadata = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      sendJson(res, 400, { error: "invalid_client_metadata" });
      return;
    }
    // Stateless: no persistence. Public clients only, secured by PKCE, not client_id secrecy.
    sendJson(res, 201, {
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: clientMetadata.redirect_uris ?? [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    return;
  }

  if (url.pathname === "/authorize" && req.method === "GET") {
    const parsed = parseAuthorizeParams(url.searchParams, trustedHttpsOrigins);
    if ("error" in parsed) {
      sendJson(res, 400, parsed);
      return;
    }
    sendConnectPage(res, parsed);
    return;
  }

  if (url.pathname === "/authorize" && req.method === "POST") {
    const raw = await readBody(req);
    const form = new URLSearchParams(raw);
    const params = {
      clientId: form.get("client_id") ?? "",
      redirectUri: form.get("redirect_uri") ?? "",
      codeChallenge: form.get("code_challenge") ?? "",
      state: form.get("state") || undefined,
    };
    const parsed = validateAuthorizeParams(params, trustedHttpsOrigins);
    if ("error" in parsed) {
      sendJson(res, 400, parsed);
      return;
    }
    const apiKey = form.get("api_key") ?? "";

    const result = await handleConnectSubmit({ apiKey, ...parsed }, { validateApiKey, keys, activeKid: ACTIVE_KID });
    if ("renderError" in result) {
      sendConnectPage(res, parsed, result.renderError);
      return;
    }
    res.writeHead(302, { location: result.redirectTo }).end();
    return;
  }

  if (url.pathname === "/token" && req.method === "POST") {
    const raw = await readBody(req);
    const form = new URLSearchParams(raw);
    const body: TokenRequestBody = {
      grantType: form.get("grant_type") ?? undefined,
      code: form.get("code") ?? undefined,
      codeVerifier: form.get("code_verifier") ?? undefined,
      redirectUri: form.get("redirect_uri") ?? undefined,
      refreshToken: form.get("refresh_token") ?? undefined,
      clientId: form.get("client_id") ?? undefined,
    };
    const result = await handleTokenRequest(body, keys, ACTIVE_KID);
    sendJson(res, "error" in result ? 400 : 200, result);
    return;
  }

  if (url.pathname === "/mcp") {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
    if (!token) {
      unauthorized(res, `${base}/.well-known/oauth-protected-resource`);
      return;
    }
    try {
      const { hevyApiKey } = await unsealAccessToken(token, keys);
      await handleMcpRequest(req, res, hevyApiKey);
    } catch (error) {
      if (error instanceof TokenError) {
        unauthorized(res, `${base}/.well-known/oauth-protected-resource`);
        return;
      }
      throw error;
    }
    return;
  }

  res.writeHead(404).end();
}

/**
 * Request handling for the remote connector, kept apart from the server that
 * binds the port (server.ts) so it can be driven directly from tests. There's
 * no per-process state to set up either way: sealing keys are just env vars,
 * re-read per request, and nothing else persists.
 */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (process.env.NODE_ENV === "production" && !process.env.PUBLIC_URL) {
      throw new Error("PUBLIC_URL must be set in production");
    }
    const { keys } = loadSealingKeys(process.env, ACTIVE_KID);
    const trustedHttpsOrigins = loadTrustedHttpsOrigins(process.env);
    setSecurityHeaders(res);
    await route(req, res, keys, trustedHttpsOrigins);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      if (!res.headersSent) res.writeHead(413).end();
      return;
    }
    console.error(error instanceof Error ? error.message : error);
    if (!res.headersSent) res.writeHead(500).end();
  }
}
