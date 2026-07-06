import {
  exerciseTemplateSchema,
  routineFolderSchema,
  routineSchema,
  workoutSchema,
  workoutsCountSchema,
  workoutsPageSchema,
  type ExerciseTemplate,
  type Routine,
  type RoutineFolder,
  type Workout,
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

  async getRoutines(params: { page?: number; pageSize?: number } = {}): Promise<Routine[]> {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/routines?${search.toString()}`);
    return routineSchema.array().parse((data as { routines: unknown }).routines);
  }

  async getRoutineFolders(): Promise<RoutineFolder[]> {
    const data = await this.request("/routine_folders");
    return routineFolderSchema.array().parse((data as { routine_folders: unknown }).routine_folders);
  }

  async getExerciseTemplates(params: { page?: number; pageSize?: number } = {}): Promise<ExerciseTemplate[]> {
    const search = new URLSearchParams();
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));
    const data = await this.request(`/exercise_templates?${search.toString()}`);
    return exerciseTemplateSchema.array().parse((data as { exercise_templates: unknown }).exercise_templates);
  }

  private async request(path: string, attempt = 0): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: { "api-key": this.apiKey, accept: "application/json" },
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 401 || response.status === 403) {
      throw new HevyApiError(
        "Hevy API key is invalid or revoked. Regenerate it in Hevy → Settings → API.",
        response.status,
      );
    }

    const isRetryable = response.status === 429 || response.status >= 500;
    if (isRetryable && attempt < MAX_RETRIES) {
      const delayMs = 2 ** attempt * 250;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this.request(path, attempt + 1);
    }

    throw new HevyApiError(`Hevy API responded ${response.status} for ${path}`, response.status);
  }
}
