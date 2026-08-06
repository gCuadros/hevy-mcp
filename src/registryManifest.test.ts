import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// `server.json` is what the official MCP Registry publishes, and nothing generates it:
// changesets bumps package.json and leaves it behind. A stale manifest points the registry
// at a version that is not the one on npm, so the drift is asserted here rather than
// discovered by whoever installs from a directory listing.
const server = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8")) as {
  name: string;
  description: string;
  version: string;
  packages: { registryType: string; identifier: string; version: string }[];
  remotes: { type: string; url: string }[];
};
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  name: string;
  version: string;
  mcpName: string;
};

describe("server.json", () => {
  it("declares the version that is actually published", () => {
    expect(server.version).toBe(pkg.version);
    expect(server.packages[0]?.version).toBe(pkg.version);
  });

  // The registry refuses the publish unless the npm tarball carries a matching `mcpName`;
  // that marker is how it proves the package is ours.
  it("matches the mcpName marker in package.json", () => {
    expect(server.name).toBe(pkg.mcpName);
    expect(server.packages[0]?.identifier).toBe(pkg.name);
  });

  it("fits the registry schema's limits", () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
  });

  it("advertises the remote transport MCP clients actually speak", () => {
    expect(server.remotes[0]?.type).toBe("streamable-http");
    expect(server.remotes[0]?.url).toMatch(/^https:\/\/.+\/mcp$/);
  });
});
