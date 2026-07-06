#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HevyClient } from "./hevy/client.js";
import { createServer } from "./server.js";
import { Store } from "./store/db.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new HevyClient({ apiKey: config.hevyApiKey });
  const store = new Store(config.dbPath);
  const server = createServer({ client, store });
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
