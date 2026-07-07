#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport, type StreamableHTTPServerTransportOptions } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { HevyClient } from "./hevy/client.js";
import { createServer } from "./server.js";
import { Store } from "./store/db.js";

/**
 * Remote entrypoint: Streamable HTTP, stateless (sessionIdGenerator: undefined —
 * no in-memory session, safe for ephemeral serverless instances). A fresh
 * McpServer + transport is created per request, matching Vercel's
 * one-invocation-per-request model.
 *
 * This branch (f5/http-transport) intentionally still uses a single global
 * HEVY_API_KEY and local SQLite, same as stdio.ts — real per-user auth
 * (oauth-vault) and Postgres (postgres-store) land in later branches. This
 * proves out the transport plumbing in isolation first.
 */
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const config = loadConfig();
  const client = new HevyClient({ apiKey: config.hevyApiKey });
  const store = new Store(config.dbPath);
  const server = createServer({ client, store });
  // The SDK's own types aren't exactOptionalPropertyTypes-clean (sessionIdGenerator/onclose
  // declared as optional-but-not-`| undefined`) — cast at the boundary, not by loosening tsconfig.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined } as unknown as StreamableHTTPServerTransportOptions);

  res.on("close", () => {
    store.close();
    void server.close();
    void transport.close();
  });

  await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
  await transport.handleRequest(req, res);
}

function main(): void {
  const port = Number(process.env.PORT ?? 3000);
  const httpServer = createHttpServer((req, res) => {
    if (req.url === "/mcp") {
      handleMcpRequest(req, res).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        if (!res.headersSent) res.writeHead(500).end();
      });
      return;
    }
    if (req.url === "/" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/plain" }).end("hevy-coach-mcp is running");
      return;
    }
    res.writeHead(404).end();
  });

  httpServer.listen(port, () => {
    console.error(`hevy-coach-mcp listening on :${port} (POST /mcp)`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
