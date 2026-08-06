---
"hevy-coach-mcp": patch
---

Redesigned the connect page, which is the only thing a remote user sees before handing
over their Hevy API key.

The page it replaced worked, but it looked like a raw form, and a raw form is exactly what
a phishing page looks like too. Someone arriving from Claude or ChatGPT has no way to tell
the two apart except by how the page presents itself, so the redesign is a security
argument as much as a cosmetic one: a brand mark and favicon drawn inline, the three steps
to find the key in Hevy set out as numbered chips, and the two lists — what the server
does and what it never does — split apart so the second one is readable at a glance rather
than buried in a paragraph. The mark is inline SVG and the favicon a data URI, because the
serverless function serves no static files and a page asking for a credential should not
be fetching anything from a third party.

`img-src data:` had to join the Content-Security-Policy for the favicon: favicons fall
back to `default-src`, which is `'none'`, so the browser was silently dropping it and
showing its blank default icon next to a field asking for an API key. No remote origin is
granted, and a test asserts none ever is.

Nothing changed about what the page does with the key: it is still validated against Hevy,
sealed into the token, and never stored.
