import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  loadSealingKeys,
  sealAccessToken,
  sealAuthorizationCode,
  sealRefreshToken,
  TokenError,
  unsealAccessToken,
  unsealAuthorizationCode,
  unsealRefreshToken,
  verifyPkce,
} from "./token.js";

function testKeys() {
  const env = { TOKEN_SEALING_KEY_v1: randomBytes(32).toString("base64") };
  return loadSealingKeys(env, "v1");
}

describe("loadSealingKeys", () => {
  it("loads keys matching the TOKEN_SEALING_KEY_ prefix", () => {
    const { keys, activeKid } = testKeys();
    expect(keys).toHaveLength(1);
    expect(activeKid).toBe("v1");
  });

  it("rejects a key that isn't 32 bytes", () => {
    const env = { TOKEN_SEALING_KEY_v1: Buffer.from("too short").toString("base64") };
    expect(() => loadSealingKeys(env, "v1")).toThrow(/32 bytes/);
  });

  it("rejects an activeKid with no matching key", () => {
    const env = { TOKEN_SEALING_KEY_v1: randomBytes(32).toString("base64") };
    expect(() => loadSealingKeys(env, "v2")).toThrow(/v2/);
  });

  it("throws when no sealing keys are present", () => {
    expect(() => loadSealingKeys({}, "v1")).toThrow(/No sealing keys/);
  });
});

describe("access token seal/unseal round trip", () => {
  it("round-trips the payload", async () => {
    const { keys, activeKid } = testKeys();
    const jwe = await sealAccessToken({ sub: "user-1", hevyApiKey: "hevy-key-abc" }, keys, activeKid);
    const payload = await unsealAccessToken(jwe, keys);
    expect(payload.sub).toBe("user-1");
    expect(payload.hevyApiKey).toBe("hevy-key-abc");
  });

  it("does not leak the raw API key in the token string itself", async () => {
    const { keys, activeKid } = testKeys();
    const jwe = await sealAccessToken({ sub: "user-1", hevyApiKey: "super-secret-hevy-key" }, keys, activeKid);
    expect(jwe).not.toContain("super-secret-hevy-key");
  });

  it("rejects a token sealed as a different type (code used as access)", async () => {
    const { keys, activeKid } = testKeys();
    const code = await sealAuthorizationCode(
      { sub: "user-1", hevyApiKey: "k", codeChallenge: "cc", redirectUri: "https://x/cb", clientId: "client" },
      keys,
      activeKid,
    );
    await expect(unsealAccessToken(code, keys)).rejects.toThrow(TokenError);
    await expect(unsealAccessToken(code, keys)).rejects.toMatchObject({ code: "wrong-type" });
  });

  it("rejects a token sealed with a different key (tampering / wrong secret)", async () => {
    const { keys, activeKid } = testKeys();
    const jwe = await sealAccessToken({ sub: "user-1", hevyApiKey: "k" }, keys, activeKid);
    const otherKeys = testKeys(); // different random key, same kid "v1"
    await expect(unsealAccessToken(jwe, otherKeys.keys)).rejects.toThrow(TokenError);
  });

  it("rejects a malformed token string", async () => {
    const { keys } = testKeys();
    await expect(unsealAccessToken("not-a-real-jwe", keys)).rejects.toThrow(TokenError);
  });

  it("rejects an expired token", async () => {
    const { keys, activeKid } = testKeys();
    const jwe = await sealAccessToken({ sub: "user-1", hevyApiKey: "k" }, keys, activeKid, -1);
    await expect(unsealAccessToken(jwe, keys)).rejects.toMatchObject({ code: "expired" });
  });

  it("supports key rotation: an old kid can still be unsealed if kept in the key list", async () => {
    const envV1 = { TOKEN_SEALING_KEY_v1: randomBytes(32).toString("base64") };
    const { keys: keysV1 } = loadSealingKeys(envV1, "v1");
    const jwe = await sealAccessToken({ sub: "user-1", hevyApiKey: "k" }, keysV1, "v1");

    const envBoth = { ...envV1, TOKEN_SEALING_KEY_v2: randomBytes(32).toString("base64") };
    const { keys: keysBoth } = loadSealingKeys(envBoth, "v2");

    const payload = await unsealAccessToken(jwe, keysBoth);
    expect(payload.sub).toBe("user-1");
  });
});

describe("authorization code", () => {
  it("round-trips PKCE and redirect metadata", async () => {
    const { keys, activeKid } = testKeys();
    const jwe = await sealAuthorizationCode(
      { sub: "user-1", hevyApiKey: "k", codeChallenge: "challenge-abc", redirectUri: "https://client/cb", clientId: "claude-code" },
      keys,
      activeKid,
    );
    const payload = await unsealAuthorizationCode(jwe, keys);
    expect(payload.codeChallenge).toBe("challenge-abc");
    expect(payload.redirectUri).toBe("https://client/cb");
    expect(payload.clientId).toBe("claude-code");
  });

  it("defaults to a short (60s) TTL", async () => {
    const { keys, activeKid } = testKeys();
    const jwe = await sealAuthorizationCode(
      { sub: "user-1", hevyApiKey: "k", codeChallenge: "cc", redirectUri: "https://x/cb", clientId: "c" },
      keys,
      activeKid,
      -1,
    );
    await expect(unsealAuthorizationCode(jwe, keys)).rejects.toMatchObject({ code: "expired" });
  });
});

describe("refresh token", () => {
  it("round-trips and rejects wrong type", async () => {
    const { keys, activeKid } = testKeys();
    const jwe = await sealRefreshToken({ sub: "user-1", hevyApiKey: "k" }, keys, activeKid);
    const payload = await unsealRefreshToken(jwe, keys);
    expect(payload.sub).toBe("user-1");
    await expect(unsealAccessToken(jwe, keys)).rejects.toMatchObject({ code: "wrong-type" });
  });
});

describe("verifyPkce", () => {
  it("accepts a matching S256 challenge", () => {
    const verifier = "test-verifier";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("rejects a mismatched verifier", () => {
    expect(verifyPkce("wrong-verifier", "some-challenge")).toBe(false);
  });
});
