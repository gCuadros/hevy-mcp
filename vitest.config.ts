import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI) — smoke tests that need HEVY_API_KEY skip themselves.
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
