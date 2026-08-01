# Request to Hevy: open third-party OAuth

Draft of a message asking Hevy to let third-party integrations authenticate users
through OAuth instead of asking them to paste an API key. Not sent by the code —
copy it, adjust it, send it.

**Where to send it:** `support@hevyapp.com`, or the in-app feedback form
(Settings → Help & Feedback). The Hevy Discord and r/Hevyapp reach the team too,
but a written request is easier for them to forward internally.

**Before sending,** re-check whether anything has changed: if
`api.hevyapp.com/.well-known/oauth-authorization-server` has started returning
something other than 404, the premise of the message is out of date.

---

**Subject:** Opening OAuth to third-party integrations

Hi,

I've built an open-source MCP server that lets AI assistants (Claude, ChatGPT)
read a user's Hevy training history and run analytics on it — estimated 1RM
trends, volume per muscle group, PRs, consistency. It's read-only, MIT licensed,
and it only works for Hevy PRO subscribers, since that's what unlocks the API.

Repo: https://github.com/gCuadros/hevy-mcp

Today the only way a user can connect it is to open Settings → API, generate an
API key, and paste that key into a web form. That works, but it's a poor
experience and, more importantly, a poor security habit to teach: it trains
people to copy a long-lived credential out of your app and paste it into someone
else's page. Every third-party integration built on your API has to ask for the
same thing, which means the pattern spreads.

I noticed your own ChatGPT integration doesn't work that way — it hands off to a
proper authorization flow where the user signs in to Hevy and grants access. So
the plumbing already exists internally. What I'd like to ask for isn't "please
build OAuth"; it's whether you'd consider opening what you already have to
third-party developers.

Even a minimal version would be a large improvement:

- An authorization endpoint users are redirected to, where they consent in
  Hevy's own UI rather than handling a raw credential.
- Read-only scopes, so an integration like mine can prove it cannot write to a
  user's log. (Right now an API key is all-or-nothing, and users have to take my
  word for it.)
- Tokens a user can see and revoke from their Hevy settings, instead of
  regenerating an API key and breaking every other integration at once.

The benefit to you is that consent, scope and revocation move back inside Hevy,
where users can see them, and PRO stays the gate — nothing about this asks you
to open the API more widely than it is today.

Happy to be a test integration if that's useful, and happy to sign whatever
developer terms come with it. If third-party OAuth isn't on the roadmap, knowing
that is useful too — I'll document the API key flow as permanent rather than
provisional.

Thanks for building the API at all; very few training apps do.

Best,
Gonzalo
