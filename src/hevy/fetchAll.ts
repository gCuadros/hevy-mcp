import { toDomainExerciseTemplate, toDomainRoutine, toDomainWorkout } from "./adapter.js";
import type { HevyClient } from "./client.js";
import type { DomainExerciseTemplate, DomainRoutine, DomainWorkout } from "../domain/types.js";

const PAGE_SIZE = 10;

/**
 * No persistent cache (deliberate — see CLAUDE.md): every tool call that
 * needs "all X" re-fetches live from Hevy, paginated. Simpler and more
 * honest for something asked a few times a day, not polled continuously.
 * The cost is repeated pagination across independent tool calls within the
 * same conversation — accepted trade-off, not a bug.
 */
export async function fetchAllWorkouts(client: HevyClient): Promise<DomainWorkout[]> {
  const workouts: DomainWorkout[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await client.getWorkouts({ page, pageSize: PAGE_SIZE });
    workouts.push(...result.workouts.map(toDomainWorkout));
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
  return workouts;
}

export async function fetchAllRoutines(client: HevyClient): Promise<DomainRoutine[]> {
  const routines: DomainRoutine[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await client.getRoutines({ page, pageSize: PAGE_SIZE });
    routines.push(...result.routines.map(toDomainRoutine));
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
  return routines;
}

export async function fetchAllExerciseTemplates(client: HevyClient): Promise<DomainExerciseTemplate[]> {
  const templates: DomainExerciseTemplate[] = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await client.getExerciseTemplates({ page, pageSize: 100 });
    templates.push(...result.exercise_templates.map(toDomainExerciseTemplate));
    pageCount = result.page_count;
    page += 1;
  } while (page <= pageCount);
  return templates;
}
