import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRequest } from "../src/http.js";

/**
 * Vercel Node.js serverless function — catch-all, see vercel.json rewrites.
 * VercelRequest/VercelResponse are structurally IncomingMessage/ServerResponse,
 * so this reuses the exact same handler as local dev (src/http.ts's main()).
 */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleRequest(req, res);
}
