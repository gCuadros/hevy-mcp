import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleConnectSubmit, handleTokenRequest, parseAuthorizeParams, renderConnectPage } from "./oauth.js";
import { loadSealingKeys, sealAuthorizationCode, sealRefreshToken, unsealAccessToken, unsealRefreshToken, verifyPkce } from "./token.js";

function testKeys() {
  const env = { TOKEN_SEALING_KEY_v1: randomBytes(32).toString("base64") };
  return loadSealingKeys(env, "v1");
}

function pkcePair() {
  const verifier = "a-code-verifier-that-is-long-enough";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

describe("parseAuthorizeParams", () => {
  it("accepts a well-formed PKCE authorize request", () => {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "claude-code",
      redirect_uri: "https://client.example/callback",
      code_challenge: "abc123",
      code_challenge_method: "S256",
      state: "xyz",
    });
    const result = parseAuthorizeParams(query);
    expect(result).toEqual({ clientId: "claude-code", redirectUri: "https://client.example/callback", codeChallenge: "abc123", state: "xyz" });
  });

  it("allows http://localhost redirect_uri for local dev clients", () => {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "c",
      redirect_uri: "http://localhost:33418/callback",
      code_challenge: "abc",
      code_challenge_method: "S256",
    });
    expect("error" in (parseAuthorizeParams(query) as object)).toBe(false);
  });

  it("rejects a non-https, non-localhost redirect_uri (open redirect guard)", () => {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "c",
      redirect_uri: "http://evil.example/callback",
      code_challenge: "abc",
      code_challenge_method: "S256",
    });
    expect(parseAuthorizeParams(query)).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a missing code_challenge", () => {
    const query = new URLSearchParams({ response_type: "code", client_id: "c", redirect_uri: "https://x/cb", code_challenge_method: "S256" });
    expect(parseAuthorizeParams(query)).toMatchObject({ error: "invalid_request" });
  });

  it("rejects an unsupported response_type", () => {
    const query = new URLSearchParams({ response_type: "token", client_id: "c", redirect_uri: "https://x/cb" });
    expect(parseAuthorizeParams(query)).toMatchObject({ error: "unsupported_response_type" });
  });
});

describe("renderConnectPage", () => {
  it("embeds the OAuth params as hidden fields and escapes untrusted values", () => {
    const html = renderConnectPage({ clientId: "<script>", redirectUri: "https://x/cb", codeChallenge: "cc", state: "s" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows the error message when provided", () => {
    const html = renderConnectPage({ clientId: "c", redirectUri: "https://x/cb", codeChallenge: "cc", state: undefined }, "bad key");
    expect(html).toContain("bad key");
  });
});

describe("handleConnectSubmit", () => {
  it("rejects an API key that fails live validation, without sealing anything", async () => {
    const { keys, activeKid } = testKeys();
    const result = await handleConnectSubmit(
      { apiKey: "bad-key", clientId: "c", redirectUri: "https://x/cb", codeChallenge: "cc", state: undefined },
      { validateApiKey: async () => false, keys, activeKid },
    );
    expect(result).toEqual({ renderError: expect.stringContaining("didn't work") });
  });

  it("on a valid key, redirects with a sealed code and preserves state", async () => {
    const { keys, activeKid } = testKeys();
    const result = await handleConnectSubmit(
      { apiKey: "good-key", clientId: "c", redirectUri: "https://x/cb", codeChallenge: "cc", state: "my-state" },
      { validateApiKey: async () => true, keys, activeKid },
    );
    expect("redirectTo" in result).toBe(true);
    if ("redirectTo" in result) {
      const url = new URL(result.redirectTo);
      expect(url.origin + url.pathname).toBe("https://x/cb");
      expect(url.searchParams.get("state")).toBe("my-state");
      expect(url.searchParams.get("code")).toBeTruthy();
    }
  });
});

describe("handleTokenRequest — authorization_code grant", () => {
  it("issues access + refresh tokens for a valid code/verifier/redirect_uri", async () => {
    const { keys, activeKid } = testKeys();
    const { verifier, challenge } = pkcePair();
    const code = await sealAuthorizationCode(
      { sub: "s1", hevyApiKey: "hevy-key", codeChallenge: challenge, redirectUri: "https://x/cb", clientId: "c" },
      keys,
      activeKid,
    );

    const result = await handleTokenRequest(
      { grantType: "authorization_code", code, codeVerifier: verifier, redirectUri: "https://x/cb", refreshToken: undefined },
      keys,
      activeKid,
    );

    expect("access_token" in result).toBe(true);
    if ("access_token" in result) {
      const accessPayload = await unsealAccessToken(result.access_token, keys);
      expect(accessPayload.hevyApiKey).toBe("hevy-key");
      const refreshPayload = await unsealRefreshToken(result.refresh_token, keys);
      expect(refreshPayload.hevyApiKey).toBe("hevy-key");
    }
  });

  it("rejects a mismatched code_verifier (PKCE failure)", async () => {
    const { keys, activeKid } = testKeys();
    const { challenge } = pkcePair();
    const code = await sealAuthorizationCode(
      { sub: "s1", hevyApiKey: "hevy-key", codeChallenge: challenge, redirectUri: "https://x/cb", clientId: "c" },
      keys,
      activeKid,
    );
    const result = await handleTokenRequest(
      { grantType: "authorization_code", code, codeVerifier: "wrong-verifier", redirectUri: "https://x/cb", refreshToken: undefined },
      keys,
      activeKid,
    );
    expect(result).toMatchObject({ error: "invalid_grant" });
  });

  it("rejects a mismatched redirect_uri", async () => {
    const { keys, activeKid } = testKeys();
    const { verifier, challenge } = pkcePair();
    const code = await sealAuthorizationCode(
      { sub: "s1", hevyApiKey: "hevy-key", codeChallenge: challenge, redirectUri: "https://x/cb", clientId: "c" },
      keys,
      activeKid,
    );
    const result = await handleTokenRequest(
      { grantType: "authorization_code", code, codeVerifier: verifier, redirectUri: "https://different/cb", refreshToken: undefined },
      keys,
      activeKid,
    );
    expect(result).toMatchObject({ error: "invalid_grant" });
  });
});

describe("handleTokenRequest — refresh_token grant", () => {
  it("issues a fresh access token, keeping the same refresh token (not rotated)", async () => {
    const { keys, activeKid } = testKeys();
    const refreshToken = await sealRefreshToken({ sub: "s1", hevyApiKey: "hevy-key" }, keys, activeKid);

    const result = await handleTokenRequest(
      { grantType: "refresh_token", code: undefined, codeVerifier: undefined, redirectUri: undefined, refreshToken },
      keys,
      activeKid,
    );

    expect("access_token" in result).toBe(true);
    if ("access_token" in result) {
      expect(result.refresh_token).toBe(refreshToken);
      const accessPayload = await unsealAccessToken(result.access_token, keys);
      expect(accessPayload.hevyApiKey).toBe("hevy-key");
    }
  });

  it("rejects an invalid refresh token", async () => {
    const { keys, activeKid } = testKeys();
    const result = await handleTokenRequest(
      { grantType: "refresh_token", code: undefined, codeVerifier: undefined, redirectUri: undefined, refreshToken: "garbage" },
      keys,
      activeKid,
    );
    expect(result).toMatchObject({ error: "invalid_grant" });
  });
});

describe("handleTokenRequest — unsupported grant_type", () => {
  it("rejects with unsupported_grant_type", async () => {
    const { keys, activeKid } = testKeys();
    const result = await handleTokenRequest(
      { grantType: "password", code: undefined, codeVerifier: undefined, redirectUri: undefined, refreshToken: undefined },
      keys,
      activeKid,
    );
    expect(result).toMatchObject({ error: "unsupported_grant_type" });
  });
});

// sanity: confirm the PKCE helper used above matches the real one
describe("pkcePair test helper", () => {
  it("produces a verifier/challenge pair that verifyPkce accepts", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });
});
