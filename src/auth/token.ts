import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decodeProtectedHeader, EncryptJWT, jwtDecrypt } from "jose";

const ISSUER = "hevy-coach-mcp";
const AUDIENCE = "hevy-coach-mcp";
const ENC = "A256GCM";
const ALG = "dir";

export interface SealingKey {
  kid: string;
  key: Uint8Array;
}

export class TokenError extends Error {
  constructor(
    message: string,
    public readonly code: "expired" | "invalid" | "wrong-type",
  ) {
    super(message);
    this.name = "TokenError";
  }
}

/**
 * Loads sealing keys from env vars shaped TOKEN_SEALING_KEY_<KID>=<base64 32 bytes>.
 * `activeKid` picks which key seals new tokens; all keys can unseal (rotation window).
 */
export function loadSealingKeys(env: NodeJS.ProcessEnv, activeKid: string): { keys: SealingKey[]; activeKid: string } {
  const prefix = "TOKEN_SEALING_KEY_";
  const keys: SealingKey[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(prefix) || !value) continue;
    const kid = name.slice(prefix.length);
    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
      throw new Error(`${name} must decode to 32 bytes for A256GCM, got ${key.length}`);
    }
    keys.push({ kid, key });
  }
  if (keys.length === 0) {
    throw new Error(`No sealing keys found (expected env vars like ${prefix}v1=<base64 32 bytes>)`);
  }
  if (!keys.some((k) => k.kid === activeKid)) {
    throw new Error(`Active kid "${activeKid}" has no matching ${prefix}${activeKid} env var`);
  }
  return { keys, activeKid };
}

function findKey(keys: SealingKey[], kid: string | undefined): SealingKey {
  const found = keys.find((k) => k.kid === kid);
  if (!found) throw new TokenError(`Unknown sealing key kid: ${kid ?? "(none)"}`, "invalid");
  return found;
}

export type TokenType = "code" | "access" | "refresh";

interface BasePayload {
  sub: string;
  hevyApiKey: string;
}

export interface CodePayload extends BasePayload {
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
}

export type AccessPayload = BasePayload;
export type RefreshPayload = BasePayload;

async function seal(
  tokenType: TokenType,
  payload: object,
  keys: SealingKey[],
  activeKid: string,
  ttlSeconds: number,
): Promise<string> {
  const activeKey = findKey(keys, activeKid);
  return new EncryptJWT({ tokenType, ...payload })
    .setProtectedHeader({ alg: ALG, enc: ENC, kid: activeKey.kid })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setJti(randomBytes(16).toString("hex"))
    .encrypt(activeKey.key);
}

async function unseal<T>(expectedType: TokenType, jwe: string, keys: SealingKey[]): Promise<T> {
  let kid: string | undefined;
  try {
    ({ kid } = decodeProtectedHeader(jwe));
  } catch {
    throw new TokenError("Malformed token", "invalid");
  }
  const key = findKey(keys, kid);

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtDecrypt(jwe, key.key, { issuer: ISSUER, audience: AUDIENCE }));
  } catch (error) {
    const message = error instanceof Error ? error.name : "";
    if (message === "JWTExpired") throw new TokenError("Token expired", "expired");
    throw new TokenError("Invalid or tampered token", "invalid");
  }

  if (payload.tokenType !== expectedType) {
    throw new TokenError(`Expected a "${expectedType}" token, got "${String(payload.tokenType)}"`, "wrong-type");
  }
  return payload as T;
}

/** Short-lived (~60s) sealed authorization code — carries the API key and PKCE challenge, no server-side storage. */
export function sealAuthorizationCode(payload: CodePayload, keys: SealingKey[], activeKid: string, ttlSeconds = 60): Promise<string> {
  return seal("code", payload, keys, activeKid, ttlSeconds);
}

export function unsealAuthorizationCode(jwe: string, keys: SealingKey[]): Promise<CodePayload> {
  return unseal<CodePayload>("code", jwe, keys);
}

/** Access token: short-lived (default 1h), presented as the MCP client's Bearer token on every request. */
export function sealAccessToken(payload: AccessPayload, keys: SealingKey[], activeKid: string, ttlSeconds = 3600): Promise<string> {
  return seal("access", payload, keys, activeKid, ttlSeconds);
}

export function unsealAccessToken(jwe: string, keys: SealingKey[]): Promise<AccessPayload> {
  return unseal<AccessPayload>("access", jwe, keys);
}

/** Refresh token: long-lived (default 90d). Not rotated on use — see PLAN.md for the stateless trade-off. */
export function sealRefreshToken(payload: RefreshPayload, keys: SealingKey[], activeKid: string, ttlSeconds = 90 * 24 * 3600): Promise<string> {
  return seal("refresh", payload, keys, activeKid, ttlSeconds);
}

export function unsealRefreshToken(jwe: string, keys: SealingKey[]): Promise<RefreshPayload> {
  return unseal<RefreshPayload>("refresh", jwe, keys);
}

/** PKCE S256: base64url(sha256(codeVerifier)) === codeChallenge, compared in constant time. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
