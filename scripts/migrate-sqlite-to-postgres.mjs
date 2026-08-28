#!/usr/bin/env node
/**
 * One-time import: SQLite app.db → PostgreSQL (DATABASE_URL).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... SQLITE_PATH=./path/to/app.db node scripts/migrate-sqlite-to-postgres.mjs
 *
 * Rules:
 * - Does NOT drop or truncate Postgres tables.
 * - Skips rows whose primary key / unique constraint already exists (no overwrite).
 * - Requires DATABASE_URL.
 *
 * If you only have a Google Drive backup named snl-app.db, download it and set SQLITE_PATH.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import pg from "pg";

const sqlitePath = path.resolve(
  process.env.SQLITE_PATH || path.join(process.cwd(), "data", "app.db")
);
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

const url = databaseUrl.startsWith("postgres://")
  ? "postgresql://" + databaseUrl.slice("postgres://".length)
  : databaseUrl;

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
CREATE INDEX IF NOT EXISTS idx_videos_uploaded_by ON videos(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_videos_procedure ON videos(procedure_type);
CREATE INDEX IF NOT EXISTS idx_narrations_video ON narrations(video_id);
CREATE INDEX IF NOT EXISTS idx_narrations_user ON narrations(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON video_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_video ON video_assignments(video_id);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles (LOWER(email));
`;

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new pg.Pool({
  connectionString: url,
  ssl:
    process.env.PGSSLMODE === "disable"
      ? undefined
      : { rejectUnauthorized: false },
});

function tableExists(name) {
  return Boolean(
    sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(name)
  );
}

function columnsOf(table) {
  return sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
}

async function insertIgnore(client, sql, params) {
  try {
    await client.query(sql, params);
    return "inserted";
  } catch (err) {
    if (err && err.code === "23505") return "skipped";
    throw err;
  }
}

async function main() {
  const client = await pool.connect();
  const stats = {};
  try {
    await client.query(PG_SCHEMA);
    await client.query(
      `ALTER TABLE narrations ADD COLUMN IF NOT EXISTS next_step TEXT`
    );
    await client.query(
      `ALTER TABLE narrations ADD COLUMN IF NOT EXISTS drive_sync_status TEXT DEFAULT 'not_required'`
    );
    await client.query(
      `ALTER TABLE narrations ADD COLUMN IF NOT EXISTS drive_audio_file_id TEXT`
    );
    await client.query(
      `ALTER TABLE narrations ADD COLUMN IF NOT EXISTS drive_synced_at TEXT`
    );

    const order = [
      "profiles",
      "videos",
      "video_assignments",
      "invites",
      "invite_videos",
      "narrations",
    ];

    for (const table of order) {
      stats[table] = { inserted: 0, skipped: 0 };
      if (!tableExists(table)) {
        console.warn(`Skipping missing SQLite table: ${table}`);
        continue;
      }
      const cols = columnsOf(table);
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
        const result = await insertIgnore(
          client,
          sql,
          cols.map((c) => row[c])
        );
        stats[table][result]++;
      }
    }

    console.log(
      "Migration complete (existing Postgres rows were not overwritten):"
    );
    console.log(JSON.stringify(stats, null, 2));
    console.log(`Source: ${sqlitePath}`);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
