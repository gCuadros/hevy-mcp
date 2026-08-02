---
"hevy-coach-mcp": patch
---

Fix the connect page's Content Security Policy blocking the very redirect that
completes the connection. `form-action 'self'` covered the POST to `/authorize`
but not its 302 back to the client's callback, because browsers apply the
directive to every hop of the navigation. Chrome reports that violation against
`/authorize` instead of the redirect target, which made it look like a
same-origin POST was being refused by a policy that allows it. The connect page
now names the callback origin in `form-action` — an origin already checked
against the approved list before the page renders.
