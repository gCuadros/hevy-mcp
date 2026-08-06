import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./http.js";

describe("contentSecurityPolicy", () => {
  it("locks form submissions to this origin by default", () => {
    expect(contentSecurityPolicy()).toContain("form-action 'self';");
  });

  it("also allows the callback origin, since the form's 302 lands there", () => {
    // Without this the browser blocks the redirect out of /authorize and the
    // whole connect flow dies after the user has already pasted their key.
    expect(contentSecurityPolicy("https://claude.ai")).toContain("form-action 'self' https://claude.ai;");
  });

  it("keeps the rest of the policy closed", () => {
    for (const policy of [contentSecurityPolicy(), contentSecurityPolicy("http://localhost:9999")]) {
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("base-uri 'none'");
    }
  });

  it("allows the inline favicon without opening up to remote images", () => {
    // Favicons fall back to default-src, so 'none' drops the data: URI and the connect
    // page renders with the browser's blank icon while asking for an API key.
    expect(contentSecurityPolicy()).toContain("img-src data:;");
    expect(contentSecurityPolicy()).not.toMatch(/img-src[^;]*https?:/);
  });
});
