import { describe, expect, it } from "vitest";
import { buildTestClient, exerciseTemplateDto, routineFolderDto, workoutDto } from "../hevy/testFixtures.js";
import { getExerciseHistory, getWorkouts, listRoutineFolders, resolveExercise, resolveRoutineFolder, searchExercises } from "./read.js";

function testDeps() {
  const client = buildTestClient({
    exerciseTemplates: [exerciseTemplateDto("bench1", "Bench Press"), exerciseTemplateDto("bench2", "Bench Press (Incline)")],
    workouts: [
      workoutDto("w1", "2026-01-01T00:00:00Z", "bench1", [{ weightKg: 80, reps: 5 }]),
      workoutDto("w2", "2026-01-08T00:00:00Z", "bench1", [{ weightKg: 85, reps: 5 }]),
    ],
  });
  return { client };
}

describe("read tools", () => {
  it("getWorkouts filters by date range and limit", async () => {
    const result = await getWorkouts(testDeps(), { from: "2026-01-05T00:00:00Z", limit: 10 });
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]?.id).toBe("w2");
  });

  it("searchExercises matches by substring, case-insensitively", async () => {
    const result = await searchExercises(testDeps(), { query: "bench" });
    expect(result.matches).toHaveLength(2);
  });

  it("resolveExercise returns ambiguous when multiple titles match", async () => {
    const result = await resolveExercise(testDeps(), "bench");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") expect(result.candidates).toHaveLength(2);
  });

  it("resolveExercise resolves an exact title match even with a substring collision", async () => {
    const result = await resolveExercise(testDeps(), "Bench Press");
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") expect(result.template.id).toBe("bench1");
  });

  it("resolveExercise returns not-found for an unknown exercise", async () => {
    const result = await resolveExercise(testDeps(), "Nonexistent Exercise");
    expect(result.status).toBe("not-found");
  });

  it("getExerciseHistory returns sets across workouts sorted by most recent first", async () => {
    const result = await getExerciseHistory(testDeps(), { exercise: "bench1" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.history).toHaveLength(2);
      expect(result.history[0]?.workoutId).toBe("w2");
      expect(result.history[0]?.sets[0]?.weightKg).toBe(85);
    }
  });

  it("getExerciseHistory passes through ambiguity instead of guessing", async () => {
    const result = await getExerciseHistory(testDeps(), { exercise: "bench" });
    expect(result.status).toBe("ambiguous");
  });

  it("listRoutineFolders returns each folder with the index Hevy orders them by", async () => {
    const client = buildTestClient({ routineFolders: [routineFolderDto(11, "Cut Season II", 0), routineFolderDto(22, "Deload", 1)] });

    expect(await listRoutineFolders({ client })).toEqual({
      folders: [
        { id: 11, index: 0, title: "Cut Season II" },
        { id: 22, index: 1, title: "Deload" },
      ],
    });
  });

  it("resolveRoutineFolder prefers an exact title over a substring collision", async () => {
    const client = buildTestClient({ routineFolders: [routineFolderDto(11, "Cut", 0), routineFolderDto(22, "Cut Season II", 1)] });

    const result = await resolveRoutineFolder({ client }, "Cut");
    expect(result).toMatchObject({ status: "resolved", folder: { id: 11 } });
  });
});
