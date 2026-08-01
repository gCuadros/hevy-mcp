#!/usr/bin/env node
import { createServer } from "node:http";
import { handleRequest } from "./http.js";

/**
 * HTTP entrypoint for the remote connector, both locally (`node dist/server.js`)
 * and on Vercel, which detects a server file in `src/` and wraps it in a
 * function. Detection keys off the `listen()` call happening at module load,
 * so this must not be guarded behind a main-module check.
 */
const port = Number(process.env.PORT ?? 3000);
createServer((req, res) => void handleRequest(req, res)).listen(port, () => {
  console.error(`hevy-coach-mcp listening on :${port}`);
});
