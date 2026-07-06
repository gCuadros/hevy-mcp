import Database from "better-sqlite3";
import type {
  DomainExerciseTemplate,
  DomainRoutine,
  DomainRoutineFolder,
  DomainWorkout,
} from "../domain/types.js";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    start_time TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_workouts_start_time ON workouts (start_time);

  CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routine_folders (
    id INTEGER PRIMARY KEY,
    updated_at TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercise_templates (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

/**
 * SQLite-backed cache. Same shape is expected to be reimplemented against
 * Postgres for the remote connector (F5) behind this same interface.
 */
export class Store {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  upsertWorkout(workout: DomainWorkout): void {
    this.db
      .prepare(
        `INSERT INTO workouts (id, updated_at, start_time, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, start_time = excluded.start_time, data = excluded.data`,
      )
      .run(workout.id, workout.updatedAt.toISOString(), workout.startTime.toISOString(), JSON.stringify(workout));
  }

  deleteWorkout(id: string): void {
    this.db.prepare("DELETE FROM workouts WHERE id = ?").run(id);
  }

  getWorkoutsCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM workouts").get() as { count: number };
    return row.count;
  }

  listWorkouts(): DomainWorkout[] {
    const rows = this.db.prepare("SELECT data FROM workouts ORDER BY start_time ASC").all() as { data: string }[];
    return rows.map((row) => reviveWorkout(JSON.parse(row.data)));
  }

  upsertRoutine(routine: DomainRoutine): void {
    this.db
      .prepare(
        `INSERT INTO routines (id, updated_at, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
      )
      .run(routine.id, routine.updatedAt.toISOString(), JSON.stringify(routine));
  }

  upsertRoutineFolder(folder: DomainRoutineFolder): void {
    this.db
      .prepare(
        `INSERT INTO routine_folders (id, updated_at, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
      )
      .run(folder.id, folder.updatedAt.toISOString(), JSON.stringify(folder));
  }

  upsertExerciseTemplate(template: DomainExerciseTemplate): void {
    this.db
      .prepare(
        `INSERT INTO exercise_templates (id, data) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      )
      .run(template.id, JSON.stringify(template));
  }

  getSyncState(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM sync_state WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSyncState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO sync_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  close(): void {
    this.db.close();
  }
}

function reviveWorkout(raw: DomainWorkout): DomainWorkout {
  return {
    ...raw,
    startTime: new Date(raw.startTime),
    endTime: new Date(raw.endTime),
    updatedAt: new Date(raw.updatedAt),
    createdAt: new Date(raw.createdAt),
  };
}
