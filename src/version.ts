import { createRequire } from "node:module";

/**
 * Read at runtime rather than imported: `rootDir` is `src`, so a static import of
 * package.json — which sits above it — would make tsc emit everything one level
 * deeper, as `dist/src/`, and every path in `bin` and `files` would break.
 *
 * `../package.json` resolves to the same file in both layouts: from `src/version.ts`
 * in development and from `dist/version.js` in the published package.
 */
const requireFromHere = createRequire(import.meta.url);

/** Reported in the MCP `initialize` handshake — the only version a connected client sees. */
export const VERSION: string = (requireFromHere("../package.json") as { version: string }).version;
