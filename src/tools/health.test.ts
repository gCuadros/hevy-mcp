import { describe, expect, it } from "vitest";
import { HevyClient } from "../hevy/client.js";
import { runHealthCheck } from "./health.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("runHealthCheck", () => {
  it("reports ok status with the live Hevy workout count", async () => {
    const fetchFn = async () => jsonResponse({ workout_count: 7 });
    const client = new HevyClient({ apiKey: "test", fetchFn: fetchFn as typeof fetch });

    const result = await runHealthCheck({ client });

    expect(result.status).toBe("ok");
    expect(result.hevyWorkoutCount).toBe(7);
  });

  it("reports error status with an actionable message on an invalid key", async () => {
    const fetchFn = async () => jsonResponse({}, 401);
    const client = new HevyClient({ apiKey: "bad", fetchFn: fetchFn as typeof fetch });

    const result = await runHealthCheck({ client });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/Regenerate it/);
  });
});
