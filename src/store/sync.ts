import type { HevyClient } from "../hevy/client.js";
import {
  toDomainExerciseTemplate,
  toDomainRoutine,
  toDomainRoutineFolder,
  toDomainWorkout,
} from "../hevy/adapter.js";
import type { Store } from "./db.js";

const PAGE_SIZE = 10;
const FULL_SYNC_DONE_KEY = "full_sync_completed";
const LAST_SYNCED_AT_KEY = "last_synced_at";

export interface SyncResult {
  mode: "full" | "incremental";
  workoutsUpserted: number;
  workoutsDeleted: number;
}

async function fullSyncWorkouts(client: HevyClient, store: Store): Promise<number> {
  let page = 1;
  let pageCount = 1;
  let count = 0;
  do {
    const result = await client.getWorkouts({ page, pageSize: PAGE_SIZE });
    for (const workout of result.workouts) {
      store.upsertWorkout(toDomainWorkout(workout));
      count += 1;
    }
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
  return count;
}

async function fullSyncRoutines(client: HevyClient, store: Store): Promise<void> {
  let page = 1;
  let pageCount = 1;
  do {
    const result = await client.getRoutines({ page, pageSize: PAGE_SIZE });
    for (const routine of result.routines) {
      store.upsertRoutine(toDomainRoutine(routine));
    }
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
}

async function fullSyncRoutineFolders(client: HevyClient, store: Store): Promise<void> {
  let page = 1;
  let pageCount = 1;
  do {
    const result = await client.getRoutineFolders({ page, pageSize: PAGE_SIZE });
    for (const folder of result.routine_folders) {
      store.upsertRoutineFolder(toDomainRoutineFolder(folder));
    }
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
}

async function fullSyncExerciseTemplates(client: HevyClient, store: Store): Promise<void> {
  let page = 1;
  let pageCount = 1;
  do {
    const result = await client.getExerciseTemplates({ page, pageSize: 100 });
    for (const template of result.exercise_templates) {
      store.upsertExerciseTemplate(toDomainExerciseTemplate(template));
    }
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
}

async function incrementalSyncWorkouts(
  client: HevyClient,
  store: Store,
  since: string,
): Promise<{ upserted: number; deleted: number }> {
  let page = 1;
  let pageCount = 1;
  let upserted = 0;
  let deleted = 0;
  do {
    const result = await client.getWorkoutEvents({ since, page, pageSize: PAGE_SIZE });
    for (const event of result.events) {
      if (event.type === "updated") {
        store.upsertWorkout(toDomainWorkout(event.workout));
        upserted += 1;
      } else {
        store.deleteWorkout(event.id);
        deleted += 1;
      }
    }
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
  return { upserted, deleted };
}

/**
 * Full sync on first run (all workouts/routines/folders/templates), then
 * incremental workout sync via `workouts/events` on subsequent runs.
 * Routines/folders/templates change rarely and aren't worth polling
 * incrementally — a fresh `sync` re-pulls them in full each time.
 */
export async function sync(client: HevyClient, store: Store): Promise<SyncResult> {
  const now = new Date().toISOString();
  const fullSyncDone = store.getSyncState(FULL_SYNC_DONE_KEY) === "true";

  await fullSyncRoutines(client, store);
  await fullSyncRoutineFolders(client, store);
  await fullSyncExerciseTemplates(client, store);

  if (!fullSyncDone) {
    const workoutsUpserted = await fullSyncWorkouts(client, store);
    store.setSyncState(FULL_SYNC_DONE_KEY, "true");
    store.setSyncState(LAST_SYNCED_AT_KEY, now);
    return { mode: "full", workoutsUpserted, workoutsDeleted: 0 };
  }

  const since = store.getSyncState(LAST_SYNCED_AT_KEY) ?? now;
  const { upserted, deleted } = await incrementalSyncWorkouts(client, store, since);
  store.setSyncState(LAST_SYNCED_AT_KEY, now);
  return { mode: "incremental", workoutsUpserted: upserted, workoutsDeleted: deleted };
}
