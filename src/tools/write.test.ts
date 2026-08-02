import { describe, expect, it } from "vitest";
import { HevyClient } from "../hevy/client.js";
import {
  buildWriteTestClient,
  exerciseTemplateDto,
  routineDto,
  routineExerciseDto,
  routineSetDto,
} from "../hevy/testFixtures.js";
import { createRoutine, updateRoutine } from "./write.js";

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
