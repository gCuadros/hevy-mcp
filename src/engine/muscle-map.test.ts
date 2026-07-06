import { describe, expect, it } from "vitest";
import { buildMuscleGroupResolver } from "./muscle-map.js";

describe("buildMuscleGroupResolver", () => {
  it("resolves a known template ID to its primary muscle group", () => {
    const resolve = buildMuscleGroupResolver([{ id: "bench1", primaryMuscleGroup: "chest" }]);
    expect(resolve("bench1")).toBe("chest");
  });

  it("returns null for an unknown template ID", () => {
    const resolve = buildMuscleGroupResolver([{ id: "bench1", primaryMuscleGroup: "chest" }]);
    expect(resolve("unknown")).toBeNull();
  });
});
