import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "./version.js";

describe("VERSION", () => {
  it("matches the version in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  // The handshake advertised 0.0.0 until 2026-08-04 because it was a literal that
  // nothing kept in sync. Anything that breaks the resolution lands back on a
  // placeholder, so assert the shape too rather than only the equality above.
  it("is a real semver, not a placeholder", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(VERSION).not.toBe("0.0.0");
  });
});
