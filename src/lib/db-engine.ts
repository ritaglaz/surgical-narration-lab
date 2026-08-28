import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getDataDir } from "./config";

export type DbBackend = "postgres" | "sqlite";

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let migrated = false;
let initPromise: Promise<void> | null = null;

/**
 * True when the running process must use Postgres (no SQLite fallback).
 * Next.js sets NODE_ENV=production during `next build`; exclude that phase so
 * local/CI builds do not require DATABASE_URL. Render always sets RENDER=true.
 */
export function isProductionRuntime(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return false;
  }
  return (
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true" ||
    Boolean(process.env.RENDER_SERVICE_ID)
  );
}

export function getDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  return raw || undefined;
}

/**
 * Production MUST use Postgres via DATABASE_URL.
 * Local/dev defaults to SQLite under DATA_DIR unless DATABASE_URL is set.
 * Never silently fall back from Postgres to SQLite in production.
 */
export function getDbBackend(): DbBackend {
  const url = getDatabaseUrl();
  if (url) return "postgres";
  if (isProductionRuntime()) {
    throw new Error(
      "DATABASE_URL is required in production. Create a Render PostgreSQL database and link it to this service. Do not use ephemeral SQLite on Render."
    );
  }
  return "sqlite";
}

export function normalizeDatabaseUrl(url: string): string {
  // node-pg accepts postgres://; some tools prefer postgresql://
  if (url.startsWith("postgres://")) {
    return "postgresql://" + url.slice("postgres://".length);
  }
  return url;
}

function ensureDataDir() {
  const dir = path.resolve(getDataDir());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getSqlite(): Database.Database {
  if (sqliteDb) return sqliteDb;
  const dir = ensureDataDir();
  const dbPath = path.join(dir, "app.db");
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");
  return sqliteDb;
}

function getPool(): Pool {
  if (pgPool) return pgPool;
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  pgPool = new Pool({
    connectionString: normalizeDatabaseUrl(url),
    // Render Postgres often needs SSL (External URL). Internal URL usually works too.
    ssl:
      process.env.PGSSLMODE === "disable"
        ? undefined
        : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    // Detect dead connections after Render restarts / idle drops
    allowExitOnIdle: false,
  });
  pgPool.on("error", (err) => {
    console.error("[db] unexpected Postgres pool error:", err);
  });
  return pgPool;
}

/** Convert `?` placeholders to Postgres `$1, $2, ...`. */
export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const SQLITE_SCHEMA = `
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'narrator' CHECK (role IN ('admin', 'narrator')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      procedure_type TEXT NOT NULL,
      description TEXT,
      case_id TEXT,
      video_storage_path TEXT NOT NULL,
      duration REAL,
      uploaded_by TEXT NOT NULL REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS narrations (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id),
      narration_mode TEXT NOT NULL CHECK (narration_mode IN ('synchronized', 'dictation')),
      audio_storage_path TEXT,
      recording_duration REAL,
      video_start_timestamp REAL NOT NULL DEFAULT 0,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_videos_uploaded_by ON videos(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_videos_procedure ON videos(procedure_type);
    CREATE INDEX IF NOT EXISTS idx_narrations_video ON narrations(video_id);
    CREATE INDEX IF NOT EXISTS idx_narrations_user ON narrations(user_id);

    CREATE TABLE IF NOT EXISTS video_assignments (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      invited_by TEXT NOT NULL REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(video_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE,
      display_name TEXT,
      token TEXT NOT NULL UNIQUE,
      invited_by TEXT NOT NULL REFERENCES profiles(id),
      accepted_at TEXT,
      user_id TEXT REFERENCES profiles(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invite_videos (
      invite_id TEXT NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      PRIMARY KEY (invite_id, video_id)
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_user ON video_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_video ON video_assignments(video_id);
    CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
`;

const PG_SCHEMA = `
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'narrator' CHECK (role IN ('admin', 'narrator')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      procedure_type TEXT NOT NULL,
      description TEXT,
      case_id TEXT,
      video_storage_path TEXT NOT NULL,
      duration DOUBLE PRECISION,
      uploaded_by TEXT NOT NULL REFERENCES profiles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS narrations (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id),
      narration_mode TEXT NOT NULL CHECK (narration_mode IN ('synchronized', 'dictation')),
      audio_storage_path TEXT,
      recording_duration DOUBLE PRECISION,
      video_start_timestamp DOUBLE PRECISION NOT NULL DEFAULT 0,
      notes TEXT,
      next_step TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
      drive_sync_status TEXT DEFAULT 'not_required',
      drive_audio_file_id TEXT,
      drive_synced_at TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_videos_uploaded_by ON videos(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_videos_procedure ON videos(procedure_type);
    CREATE INDEX IF NOT EXISTS idx_narrations_video ON narrations(video_id);
    CREATE INDEX IF NOT EXISTS idx_narrations_user ON narrations(user_id);

    CREATE TABLE IF NOT EXISTS video_assignments (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      invited_by TEXT NOT NULL REFERENCES profiles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(video_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT,
      token TEXT NOT NULL UNIQUE,
      invited_by TEXT NOT NULL REFERENCES profiles(id),
      accepted_at TIMESTAMPTZ,
      user_id TEXT REFERENCES profiles(id),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invite_videos (
      invite_id TEXT NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      PRIMARY KEY (invite_id, video_id)
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_user ON video_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_video ON video_assignments(video_id);
    CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
    CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles (LOWER(email));
`;

function ensureSqliteColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
) {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function ensurePgColumn(
  client: PoolClient,
  table: string,
  column: string,
  definition: string
) {
  await client.query(
    `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`
  );
}

async function runMigrations(): Promise<void> {
  const backend = getDbBackend();
  if (backend === "sqlite") {
    const db = getSqlite();
    db.exec(SQLITE_SCHEMA);
    ensureSqliteColumn(db, "narrations", "next_step", "TEXT");
    ensureSqliteColumn(
      db,
      "narrations",
      "drive_sync_status",
      "TEXT DEFAULT 'not_required'"
    );
    ensureSqliteColumn(db, "narrations", "drive_audio_file_id", "TEXT");
    ensureSqliteColumn(db, "narrations", "drive_synced_at", "TEXT");
    return;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(PG_SCHEMA);
    await ensurePgColumn(client, "narrations", "next_step", "TEXT");
    await ensurePgColumn(
      client,
      "narrations",
      "drive_sync_status",
      "TEXT DEFAULT 'not_required'"
    );
    await ensurePgColumn(client, "narrations", "drive_audio_file_id", "TEXT");
    await ensurePgColumn(client, "narrations", "drive_synced_at", "TEXT");
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Idempotent schema migrate; safe to call on every request bootstrap. */
export async function ensureDbReady(): Promise<void> {
  if (migrated) return;
  if (!initPromise) {
    initPromise = (async () => {
      await runMigrations();
      if (getDbBackend() === "postgres") {
        await getPool().query("SELECT 1");
      }
      migrated = true;
      console.log(`[db] ready backend=${getDbBackend()}`);
    })().catch((err) => {
      initPromise = null;
      migrated = false;
      throw err;
    });
  }
  await initPromise;
}

export async function queryAll<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureDbReady();
  if (getDbBackend() === "postgres") {
    const result = await getPool().query<T>(toPgPlaceholders(sql), params);
    return result.rows;
  }
  const stmt = getSqlite().prepare(sql);
  return stmt.all(...params) as T[];
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows[0] || null;
}

export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<void> {
  await ensureDbReady();
  if (getDbBackend() === "postgres") {
    await getPool().query(toPgPlaceholders(sql), params);
    return;
  }
  getSqlite()
    .prepare(sql)
    .run(...params);
}

export type DbTx = {
  queryAll: <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ) => Promise<R[]>;
  queryOne: <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ) => Promise<R | null>;
  execute: (sql: string, params?: unknown[]) => Promise<void>;
};

export async function withTransaction<T>(
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  await ensureDbReady();
  if (getDbBackend() === "sqlite") {
    const db = getSqlite();
    const tx: DbTx = {
      queryAll: async <R extends QueryResultRow = QueryResultRow>(
        sql: string,
        params: unknown[] = []
      ) => db.prepare(sql).all(...params) as R[],
      queryOne: async <R extends QueryResultRow = QueryResultRow>(
        sql: string,
        params: unknown[] = []
      ) => (db.prepare(sql).get(...params) as R | undefined) || null,
      execute: async (sql: string, params: unknown[] = []) => {
        db.prepare(sql).run(...params);
      },
    };
    return fn(tx);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const tx: DbTx = {
      queryAll: async <R extends QueryResultRow = QueryResultRow>(
        sql: string,
        params: unknown[] = []
      ) => {
        const r = await client.query<R>(toPgPlaceholders(sql), params);
        return r.rows;
      },
      queryOne: async <R extends QueryResultRow = QueryResultRow>(
        sql: string,
        params: unknown[] = []
      ) => {
        const r = await client.query<R>(toPgPlaceholders(sql), params);
        return (r.rows[0] as R | undefined) ?? null;
      },
      execute: async (sql: string, params: unknown[] = []) => {
        await client.query(toPgPlaceholders(sql), params);
      },
    };
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Close connections (tests / restore). */
export async function closeDb(): Promise<void> {
  if (sqliteDb) {
    try {
      sqliteDb.close();
    } catch {
      // ignore
    }
    sqliteDb = null;
  }
  if (pgPool) {
    await pgPool.end().catch(() => undefined);
    pgPool = null;
  }
  migrated = false;
  initPromise = null;
}

/** @deprecated Use closeDb — kept for Drive restore paths that only apply to SQLite. */
export function closeDbForRestore() {
  if (sqliteDb) {
    try {
      sqliteDb.close();
    } catch {
      // ignore
    }
    sqliteDb = null;
  }
  migrated = false;
  initPromise = null;
}

export function nowSql(): string {
  return getDbBackend() === "postgres" ? "NOW()" : "datetime('now')";
}
