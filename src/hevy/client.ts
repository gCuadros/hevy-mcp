import {
  bodyMeasurementSchema,
  bodyMeasurementWriteSchema,
  bodyMeasurementsPageSchema,
  createBodyMeasurementBodySchema,
  createRoutineBodySchema,
  createRoutineFolderBodySchema,
  exerciseTemplatesPageSchema,
  routineFolderResponseSchema,
  routineFoldersPageSchema,
  routineResponseSchema,
  routinesPageSchema,
  updateRoutineBodySchema,
  workoutEventsPageSchema,
  workoutSchema,
  workoutsCountSchema,
  workoutsPageSchema,
  type BodyMeasurement,
  type BodyMeasurementWrite,
  type BodyMeasurementsPage,
  type CreateBodyMeasurementBody,
  type CreateRoutineBody,
  type CreateRoutineFolderBody,
  type ExerciseTemplatesPage,
  type Routine,
  type RoutineFolder,
  type RoutineFoldersPage,
  type RoutinesPage,
  type UpdateRoutineBody,
  type Workout,
  type WorkoutEventsPage,
  type WorkoutsPage,
} from "./schemas.js";

const BASE_URL = "https://api.hevyapp.com/v1";
const MAX_RETRIES = 4;

export class HevyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HevyApiError";
  }
}

export interface HevyClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Thin HTTP client for the Hevy API: auth header, retry/backoff on 429/5xx,
 * actionable errors on 401/403. No caching, no business logic — that lives
 * in store/ and engine/.
 */

export class HevyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: HevyClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async getWorkouts(params: { page?: number; pageSize?: number } = {}): Promise<WorkoutsPage> {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/workouts?${search.toString()}`);
    return workoutsPageSchema.parse(data);
  }

  async getWorkout(id: string): Promise<Workout> {
    const data = await this.request(`/workouts/${id}`);
    return workoutSchema.parse(data);
  }

  async getWorkoutsCount(): Promise<number> {
    const data = await this.request("/workouts/count");
    return workoutsCountSchema.parse(data).workout_count;
  }

  async getWorkoutEvents(params: { since: string; page?: number; pageSize?: number }): Promise<WorkoutEventsPage> {
    const search = new URLSearchParams({ since: params.since });
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/workouts/events?${search.toString()}`);
    return workoutEventsPageSchema.parse(data);
  }

  async getRoutines(params: { page?: number; pageSize?: number } = {}): Promise<RoutinesPage> {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/routines?${search.toString()}`);
    return routinesPageSchema.parse(data);
  }

  async getRoutineById(id: string): Promise<Routine> {
    const data = await this.request(`/routines/${encodeURIComponent(id)}`);
    return routineResponseSchema.parse(data);
  }

  async createRoutine(body: CreateRoutineBody): Promise<Routine> {
    const data = await this.request("/routines", { method: "POST", body: createRoutineBodySchema.parse(body) });
    return routineResponseSchema.parse(data);
  }

  async updateRoutine(id: string, body: UpdateRoutineBody): Promise<Routine> {
    const data = await this.request(`/routines/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: updateRoutineBodySchema.parse(body),
    });
    return routineResponseSchema.parse(data);
  }

  async getRoutineFolders(params: { page?: number; pageSize?: number } = {}): Promise<RoutineFoldersPage> {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/routine_folders?${search.toString()}`);
    return routineFoldersPageSchema.parse(data);
  }

  async createRoutineFolder(body: CreateRoutineFolderBody): Promise<RoutineFolder> {
    const data = await this.request("/routine_folders", { method: "POST", body: createRoutineFolderBodySchema.parse(body) });
    return routineFolderResponseSchema.parse(data);
  }

  async getBodyMeasurements(params: { page?: number; pageSize?: number } = {}): Promise<BodyMeasurementsPage> {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/body_measurements?${search.toString()}`);
    return bodyMeasurementsPageSchema.parse(data);
  }

  /** Returns null for a date with no entry, because "nothing logged that day" is an answer, not an error. */
  async getBodyMeasurementByDate(date: string): Promise<BodyMeasurement | null> {
    try {
      const data = await this.request(`/body_measurements/${encodeURIComponent(date)}`);
      return bodyMeasurementSchema.parse(data);
    } catch (error) {
      if (error instanceof HevyApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** 409 if the date already has an entry. The caller is expected to update instead. */
  async createBodyMeasurement(body: CreateBodyMeasurementBody): Promise<void> {
    await this.request("/body_measurements", { method: "POST", body: createBodyMeasurementBodySchema.parse(body) });
  }

  /** Overwrites the whole entry: every field left out of `body` is set to null. */
  async updateBodyMeasurement(date: string, body: BodyMeasurementWrite): Promise<void> {
    await this.request(`/body_measurements/${encodeURIComponent(date)}`, {
      method: "PUT",
      body: bodyMeasurementWriteSchema.parse(body),
    });
  }

  async getExerciseTemplates(params: { page?: number; pageSize?: number } = {}): Promise<ExerciseTemplatesPage> {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/exercise_templates?${search.toString()}`);
    return exerciseTemplatesPageSchema.parse(data);
  }

  private async request(path: string, init: { method?: string; body?: unknown } = {}, attempt = 0): Promise<unknown> {
    const method = init.method ?? "GET";
    const isWrite = method !== "GET";

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "api-key": this.apiKey,
        accept: "application/json",
        ...(isWrite ? { "content-type": "application/json" } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });

    if (response.ok) {
      // The body-measurement writes answer 200 with an empty body, so json() would
      // throw on a request that succeeded. Callers that need the stored record read
      // it back instead.
      const text = await response.text();
      return text.length === 0 ? undefined : JSON.parse(text);
    }

    if (response.status === 401 || response.status === 403) {
      throw new HevyApiError(
        await this.errorMessage(response, "Hevy API key is invalid or revoked. Regenerate it in Hevy → Settings → API."),
        response.status,
      );
    }

    // 5xx on a write is not safely retryable: Hevy has no idempotency key and no
    // DELETE, so a create that actually landed before the error would leave a
    // duplicate routine the user cannot remove through this connector. 429 is
    // safe either way — the request was rejected before it did anything.
    const isRetryable = response.status === 429 || (!isWrite && response.status >= 500);
    if (isRetryable && attempt < MAX_RETRIES) {
      const delayMs = 2 ** attempt * 250;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this.request(path, init, attempt + 1);
    }

    throw new HevyApiError(
      await this.errorMessage(response, `Hevy API responded ${response.status} for ${method} ${path}`),
      response.status,
    );
  }

  /** Hevy explains rejected writes in a `{ error }` body — worth surfacing verbatim. */
  private async errorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const body = (await response.json()) as { error?: unknown };
      return typeof body.error === "string" && body.error ? `${fallback} — ${body.error}` : fallback;
    } catch {
      return fallback;
    }
  }
}
