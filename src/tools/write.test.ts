import { describe, expect, it } from "vitest";
import { HevyClient } from "../hevy/client.js";
import {
  bodyMeasurementDto,
  buildWriteTestClient,
  exerciseTemplateDto,
  routineDto,
  routineExerciseDto,
  routineFolderDto,
  routineSetDto,
} from "../hevy/testFixtures.js";
import { createRoutine, createRoutineFolder, logBodyMeasurement, updateRoutine } from "./write.js";

const templates = [
  exerciseTemplateDto("trxrow", "TRX Row"),
  exerciseTemplateDto("bench1", "Bench Press"),
  exerciseTemplateDto("bench2", "Bench Press (Incline)"),
];

describe("create-routine", () => {
  it("resolves exercise names and sends what the user asked for", async () => {
    const { client, writes } = buildWriteTestClient({ exerciseTemplates: templates });

    const result = await createRoutine(
      { client },
      {
        title: "Full body TRX",
        exercises: [{ exercise: "TRX Row", restSeconds: 90, sets: [{ reps: 10 }, { reps: 10, type: "failure" }] }],
      },
    );

    expect(result.status).toBe("written");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.method).toBe("POST");
    expect(writes[0]?.body.routine).toMatchObject({
      title: "Full body TRX",
      folder_id: null,
      exercises: [
        {
          exercise_template_id: "trxrow",
          rest_seconds: 90,
          sets: [
            { type: "normal", reps: 10 },
            { type: "failure", reps: 10 },
          ],
        },
      ],
    });
  });

  it("writes nothing when a name is ambiguous, and says which", async () => {
    const { client, writes } = buildWriteTestClient({ exerciseTemplates: templates });

    // "Bench" matches both bench templates; an exact title would have resolved.
    const result = await createRoutine({ client }, { title: "Push", exercises: [{ exercise: "Bench", sets: [{ reps: 5 }] }] });

    expect(result).toMatchObject({ status: "unresolved", problems: [{ exercise: "Bench", status: "ambiguous" }] });
    expect(writes).toHaveLength(0);
  });

  it("writes nothing when one exercise out of several is unknown", async () => {
    const { client, writes } = buildWriteTestClient({ exerciseTemplates: templates });

    const result = await createRoutine(
      { client },
      {
        title: "Mixed",
        exercises: [
          { exercise: "TRX Row", sets: [{ reps: 10 }] },
          { exercise: "Zercher Nonsense", sets: [{ reps: 10 }] },
        ],
      },
    );

    expect(result).toMatchObject({ status: "unresolved", problems: [{ exercise: "Zercher Nonsense", status: "not-found" }] });
    expect(writes).toHaveLength(0);
  });

  describe("folders", () => {
    const folders = [routineFolderDto(11, "Cut Season II", 0), routineFolderDto(22, "Cut Season I", 1), routineFolderDto(33, "Deload", 2)];

    it("resolves a folder name to its ID", async () => {
      const { client, writes } = buildWriteTestClient({ routineFolders: folders, exerciseTemplates: templates });

      const result = await createRoutine(
        { client },
        { title: "Push", folder: "Deload", exercises: [{ exercise: "TRX Row", sets: [{ reps: 10 }] }] },
      );

      expect(result.status).toBe("written");
      expect(writes[0]?.body.routine?.folder_id).toBe(33);
    });

    it("accepts a folder ID passed as a string", async () => {
      const { client, writes } = buildWriteTestClient({ routineFolders: folders, exerciseTemplates: templates });

      await createRoutine({ client }, { title: "Push", folder: "11", exercises: [{ exercise: "TRX Row", sets: [{ reps: 10 }] }] });

      expect(writes[0]?.body.routine?.folder_id).toBe(11);
    });

    it("writes nothing when the folder name matches two folders", async () => {
      const { client, writes } = buildWriteTestClient({ routineFolders: folders, exerciseTemplates: templates });

      const result = await createRoutine(
        { client },
        { title: "Push", folder: "Cut Season", exercises: [{ exercise: "TRX Row", sets: [{ reps: 10 }] }] },
      );

      expect(result).toMatchObject({
        status: "folder-ambiguous",
        folder: "Cut Season",
        candidates: [{ id: 11, title: "Cut Season II" }, { id: 22, title: "Cut Season I" }],
      });
      expect(writes).toHaveLength(0);
    });

    it("writes nothing when the folder does not exist, rather than falling back to the default one", async () => {
      const { client, writes } = buildWriteTestClient({ routineFolders: folders, exerciseTemplates: templates });

      const result = await createRoutine(
        { client },
        { title: "Push", folder: "Bulk Season", exercises: [{ exercise: "TRX Row", sets: [{ reps: 10 }] }] },
      );

      expect(result).toMatchObject({ status: "folder-not-found", folder: "Bulk Season" });
      expect(writes).toHaveLength(0);
    });

    it("sends a null folder when none is asked for", async () => {
      const { client, writes } = buildWriteTestClient({ routineFolders: folders, exerciseTemplates: templates });

      await createRoutine({ client }, { title: "Push", exercises: [{ exercise: "TRX Row", sets: [{ reps: 10 }] }] });

      expect(writes[0]?.body.routine?.folder_id).toBeNull();
    });
  });
});

describe("create-routine-folder", () => {
  const folders = [routineFolderDto(11, "Cut Season II", 0), routineFolderDto(33, "Deload", 1)];

  it("creates the folder and reports where Hevy put it", async () => {
    const { client, writes } = buildWriteTestClient({ routineFolders: folders });

    const result = await createRoutineFolder({ client }, { title: "Bulk Season" });

    expect(result).toMatchObject({ status: "written", result: { title: "Bulk Season", index: 0 } });
    expect(writes).toEqual([{ method: "POST", path: "/v1/routine_folders", body: { routine_folder: { title: "Bulk Season" } } }]);
  });

  it("writes nothing when a folder with that title already exists, whatever the casing", async () => {
    const { client, writes } = buildWriteTestClient({ routineFolders: folders });

    const result = await createRoutineFolder({ client }, { title: "  deload  " });

    expect(result).toMatchObject({ status: "duplicate", existing: { id: 33, title: "Deload" } });
    expect(writes).toHaveLength(0);
  });

  it("does not treat a title that merely contains an existing one as a duplicate", async () => {
    const { client, writes } = buildWriteTestClient({ routineFolders: folders });

    const result = await createRoutineFolder({ client }, { title: "Deload Week" });

    expect(result.status).toBe("written");
    expect(writes[0]?.body.routine_folder).toEqual({ title: "Deload Week" });
  });
});

describe("log-body-measurement", () => {
  it("creates an entry for a date that has none", async () => {
    const { client, writes } = buildWriteTestClient({ bodyMeasurements: [] });

    const result = await logBodyMeasurement({ client }, { date: "2026-08-04", weightKg: 73.5 });

    expect(result).toMatchObject({ status: "created", date: "2026-08-04", measurement: { date: "2026-08-04", weightKg: 73.5 } });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: "POST", path: "/v1/body_measurements", body: { measurement: { date: "2026-08-04" } } });
  });

  it("keeps the metrics it was not given, which a bare PUT would erase", async () => {
    const { client, writes } = buildWriteTestClient({
      bodyMeasurements: [bodyMeasurementDto("2026-08-04", { weight_kg: 73.5, fat_percent: 18.2, waist: 80 })],
    });

    const result = await logBodyMeasurement({ client }, { date: "2026-08-04", weightKg: 74.1 });

    expect(result).toMatchObject({
      status: "updated",
      measurement: { weightKg: 74.1, fatPercent: 18.2, waistCm: 80 },
      kept: ["fatPercent", "waistCm"],
    });
    expect(writes[0]).toMatchObject({
      method: "PUT",
      path: "/v1/body_measurements/2026-08-04",
      body: { measurement: { weight_kg: 74.1, fat_percent: 18.2, waist: 80 } },
    });
  });

  it("updates rather than letting Hevy reject the second entry for a date with 409", async () => {
    const { client, writes } = buildWriteTestClient({ bodyMeasurements: [bodyMeasurementDto("2026-08-04", { weight_kg: 73.5 })] });

    const result = await logBodyMeasurement({ client }, { date: "2026-08-04", weightKg: 73.9 });

    expect(result.status).toBe("updated");
    expect(writes.every((write) => write.method === "PUT")).toBe(true);
  });

  it("writes nothing when given a date and no measurement", async () => {
    const { client, writes } = buildWriteTestClient({ bodyMeasurements: [] });

    const result = await logBodyMeasurement({ client }, { date: "2026-08-04" });

    expect(result).toEqual({ status: "empty", date: "2026-08-04" });
    expect(writes).toHaveLength(0);
  });

  it("leaves other dates alone", async () => {
    const { client } = buildWriteTestClient({
      bodyMeasurements: [bodyMeasurementDto("2026-08-01", { weight_kg: 73.0 }), bodyMeasurementDto("2026-08-04", { weight_kg: 73.5 })],
    });

    await logBodyMeasurement({ client }, { date: "2026-08-04", weightKg: 74.1 });

    expect(await client.getBodyMeasurementByDate("2026-08-01")).toMatchObject({ weight_kg: 73.0 });
  });
});

describe("update-routine", () => {
  const existing = routineDto("r1", "Full body TRX", 7, [
    routineExerciseDto("trxrow", "TRX Row", {
      rest_seconds: "90",
      notes: "slow eccentric",
      sets: [routineSetDto({ reps: null, rep_range: { start: 8, end: 12 } })],
    }),
  ]);

  it("keeps rest timers and rep ranges when only the title changes", async () => {
    const { client, writes } = buildWriteTestClient({ routines: [existing], exerciseTemplates: templates });

    const result = await updateRoutine({ client }, { routine: "Full body TRX", title: "Full body TRX v2" });

    expect(result.status).toBe("written");
    expect(writes[0]?.method).toBe("PUT");
    expect(writes[0]?.body.routine).toMatchObject({
      title: "Full body TRX v2",
      exercises: [
        {
          exercise_template_id: "trxrow",
          rest_seconds: 90,
          notes: "slow eccentric",
          sets: [{ rep_range: { start: 8, end: 12 } }],
        },
      ],
    });
  });

  it("replaces the exercises wholesale when they are passed", async () => {
    const { client, writes } = buildWriteTestClient({ routines: [existing], exerciseTemplates: templates });

    await updateRoutine({ client }, { routine: "r1", exercises: [{ exercise: "TRX Row", sets: [{ reps: 12 }] }] });

    expect(writes[0]?.body.routine).toMatchObject({
      title: "Full body TRX",
      exercises: [{ exercise_template_id: "trxrow", rest_seconds: null, sets: [{ reps: 12 }] }],
    });
  });

  it("refuses to guess between two routines with similar titles", async () => {
    const { client, writes } = buildWriteTestClient({
      routines: [routineDto("r1", "Push A"), routineDto("r2", "Push B")],
      exerciseTemplates: templates,
    });

    const result = await updateRoutine({ client }, { routine: "Push", title: "Renamed" });

    expect(result).toMatchObject({ status: "ambiguous" });
    expect(writes).toHaveLength(0);
  });

  it("reports a routine that does not exist instead of creating one", async () => {
    const { client, writes } = buildWriteTestClient({ routines: [], exerciseTemplates: templates });

    expect(await updateRoutine({ client }, { routine: "Nope" })).toEqual({ status: "not-found" });
    expect(writes).toHaveLength(0);
  });
});

describe("write retries", () => {
  it("does not retry a failed create, which could duplicate a routine Hevy cannot delete", async () => {
    let calls = 0;
    const client = new HevyClient({
      apiKey: "test",
      fetchFn: (async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: "Routine limit exceeded" }), { status: 500 });
      }) as unknown as typeof fetch,
    });

    await expect(
      client.createRoutine({ routine: { title: "X", folder_id: null, exercises: [] } }),
    ).rejects.toThrow(/Routine limit exceeded/);
    expect(calls).toBe(1);
  });
});
