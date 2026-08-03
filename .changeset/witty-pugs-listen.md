---
"hevy-coach-mcp": patch
---

Accept IPv6 loopback callbacks (`http://[::1]:PORT/…`) as an approved `redirect_uri`. RFC 8252 lets a CLI client bind either loopback family, so allowing only `127.0.0.1` locked out conformant clients on hosts where IPv6 wins.
