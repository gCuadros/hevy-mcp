---
"hevy-coach-mcp": patch
---

Make the remote connector usable by a first-time user, and unblock npm publishing.

- Redesigned the OAuth connect page: mobile viewport (it's opened in an embedded
  browser on a phone, which is where it was worst), 16px input so iOS Safari
  doesn't zoom on focus, dark-mode support, numbered instructions for finding the
  API key in Hevy, and a plain statement of what happens to the key. Errors now
  render as a styled block that keeps the OAuth request intact for a retry.
- `/token` now rejects an `authorization_code` grant whose `client_id` doesn't
  match the one the code was issued to. Public clients that omit `client_id`
  entirely are still accepted, as RFC 6749 allows.
- Removed `"private": true` and added `prepublishOnly`, so `npx hevy-coach-mcp`
  — which the docs have always instructed — can actually work.
- `build` now cleans `dist/` and excludes tests. The published tarball was
  carrying compiled tests and a stale `dist/store/` (database code from before
  the cache was removed) that no longer has any source.
- Documented the two honest limits of the stateless design in `docs/CONNECTOR.md`:
  the authorization code is not single-use, and the sealing key is a single point
  of failure with no server-side revocation.
- Restrict remote OAuth callbacks to deployment-approved origins, while keeping
  loopback callbacks for desktop and CLI MCP clients. The connect page now shows
  the approved return origin before accepting a Hevy API key.
