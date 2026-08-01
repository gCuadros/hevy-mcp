---
"hevy-coach-mcp": patch
---

Fix the Vercel deployment, which never got past the build. Vercel picked its
Node.js server builder for this project and looked for an entrypoint in the root
or `src/`, so it never reached the `api/` directory the deployment was built
around, and failed with *No entrypoint found*. Renaming `src/server.ts` out of
the way had removed the file it used to latch onto, leaving it with nothing.

The remote server is now a plain Node HTTP server in `src/server.ts` that opens
the port at module load, which is exactly what Vercel detects. `src/http.ts`
keeps all the routing and is still what the tests drive directly; `api/handler.ts`
and `vercel.json` are gone. Run the remote server locally with
`node dist/server.js` instead of `node dist/http.js`.
