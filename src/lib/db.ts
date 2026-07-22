import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDataDir } from "./config";
import type {
  Narration,
  NarrationMode,
  NarrationStatus,
  Profile,
  UserRole,
  Video,
  VideoWithStats,
} from "./types";

let dbInstance: Database.Database | null = null;

function ensureDataDir() {
  const dir = path.resolve(getDataDir());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dir = ensureDataDir();
  const dbPath = path.join(dir, "app.db");
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  migrate(dbInstance);
  return dbInstance;
}

function migrate(db: Database.Database) {
  db.exec(`
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
  `);
}

export function createProfile(input: {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role?: UserRole;
}): Profile {
  const db = getDb();
  const role = input.role || "narrator";
  db.prepare(
    `INSERT INTO profiles (id, email, password_hash, display_name, role)
     VALUES (@id, @email, @password_hash, @display_name, @role)`
  ).run({ ...input, role });
  return getProfileById(input.id)!;
}

export function getProfileById(id: string): Profile | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, display_name, role, created_at FROM profiles WHERE id = ?`
    )
    .get(id) as Profile | undefined;
  return row || null;
}

export function getProfileByEmail(
  email: string
): (Profile & { password_hash: string }) | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, password_hash, display_name, role, created_at
       FROM profiles WHERE email = ? COLLATE NOCASE`
    )
    .get(email) as (Profile & { password_hash: string }) | undefined;
  return row || null;
}

export function createVideo(input: {
  id: string;
  title: string;
  procedure_type: string;
  description?: string | null;
  case_id?: string | null;
  video_storage_path: string;
  duration?: number | null;
  uploaded_by: string;
}): Video {
  getDb()
    .prepare(
      `INSERT INTO videos
       (id, title, procedure_type, description, case_id, video_storage_path, duration, uploaded_by)
       VALUES (@id, @title, @procedure_type, @description, @case_id, @video_storage_path, @duration, @uploaded_by)`
    )
    .run({
      id: input.id,
      title: input.title,
      procedure_type: input.procedure_type,
      description: input.description ?? null,
      case_id: input.case_id ?? null,
      video_storage_path: input.video_storage_path,
      duration: input.duration ?? null,
      uploaded_by: input.uploaded_by,
    });
  return getVideoById(input.id)!;
}

export function getVideoById(id: string): Video | null {
  const row = getDb()
    .prepare(`SELECT * FROM videos WHERE id = ?`)
    .get(id) as Video | undefined;
  return row || null;
}

export function listVideos(opts: {
  search?: string;
  procedure_type?: string;
  status?: string;
  userId?: string;
}): VideoWithStats[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: Record<string, string> = {};

  if (opts.search) {
    clauses.push(
      `(v.title LIKE @search OR v.procedure_type LIKE @search OR IFNULL(v.case_id,'') LIKE @search)`
    );
    params.search = `%${opts.search}%`;
  }
  if (opts.procedure_type) {
    clauses.push(`v.procedure_type = @procedure_type`);
    params.procedure_type = opts.procedure_type;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
    SELECT
      v.*,
      COUNT(n.id) AS narration_count,
      COALESCE(
        (SELECT n2.status FROM narrations n2
         WHERE n2.video_id = v.id
         ${opts.userId ? "AND n2.user_id = @userId" : ""}
         ORDER BY CASE n2.status WHEN 'submitted' THEN 2 WHEN 'draft' THEN 1 ELSE 0 END DESC,
                  n2.updated_at DESC
         LIMIT 1),
        'not_started'
      ) AS narration_status,
      p.display_name AS uploader_name
    FROM videos v
    LEFT JOIN narrations n ON n.video_id = v.id
    LEFT JOIN profiles p ON p.id = v.uploaded_by
    ${where}
    GROUP BY v.id
    ORDER BY v.created_at DESC
  `
    )
    .all(opts.userId ? { ...params, userId: opts.userId } : params) as Array<
    Video & {
      narration_count: number;
      narration_status: "not_started" | NarrationStatus;
      uploader_name: string;
    }
  >;

  let result = rows;
  if (opts.status && opts.status !== "all") {
    result = rows.filter((r) => r.narration_status === opts.status);
  }
  return result;
}

export function updateVideoDuration(id: string, duration: number) {
  getDb()
    .prepare(`UPDATE videos SET duration = ? WHERE id = ?`)
    .run(duration, id);
}

export function createNarration(input: {
  id: string;
  video_id: string;
  user_id: string;
  narration_mode: NarrationMode;
  audio_storage_path?: string | null;
  recording_duration?: number | null;
  video_start_timestamp?: number;
  notes?: string | null;
  status?: NarrationStatus;
}): Narration {
  getDb()
    .prepare(
      `INSERT INTO narrations
       (id, video_id, user_id, narration_mode, audio_storage_path, recording_duration,
        video_start_timestamp, notes, status)
       VALUES (@id, @video_id, @user_id, @narration_mode, @audio_storage_path,
               @recording_duration, @video_start_timestamp, @notes, @status)`
    )
    .run({
      id: input.id,
      video_id: input.video_id,
      user_id: input.user_id,
      narration_mode: input.narration_mode,
      audio_storage_path: input.audio_storage_path ?? null,
      recording_duration: input.recording_duration ?? null,
      video_start_timestamp: input.video_start_timestamp ?? 0,
      notes: input.notes ?? null,
      status: input.status ?? "draft",
    });
  return getNarrationById(input.id)!;
}

export function getNarrationById(id: string): Narration | null {
  const row = getDb()
    .prepare(`SELECT * FROM narrations WHERE id = ?`)
    .get(id) as Narration | undefined;
  return row || null;
}

export function listNarrationsForVideo(videoId: string): Array<
  Narration & { narrator_name: string; narrator_email: string }
> {
  return getDb()
    .prepare(
      `SELECT n.*, p.display_name AS narrator_name, p.email AS narrator_email
       FROM narrations n
       JOIN profiles p ON p.id = n.user_id
       WHERE n.video_id = ?
       ORDER BY n.updated_at DESC`
    )
    .all(videoId) as Array<
    Narration & { narrator_name: string; narrator_email: string }
  >;
}

export function updateNarration(
  id: string,
  patch: Partial<{
    audio_storage_path: string | null;
    recording_duration: number | null;
    video_start_timestamp: number;
    notes: string | null;
    status: NarrationStatus;
    narration_mode: NarrationMode;
  }>
): Narration | null {
  const current = getNarrationById(id);
  if (!current) return null;

  const next = {
    audio_storage_path:
      patch.audio_storage_path !== undefined
        ? patch.audio_storage_path
        : current.audio_storage_path,
    recording_duration:
      patch.recording_duration !== undefined
        ? patch.recording_duration
        : current.recording_duration,
    video_start_timestamp:
      patch.video_start_timestamp !== undefined
        ? patch.video_start_timestamp
        : current.video_start_timestamp,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    status: patch.status !== undefined ? patch.status : current.status,
    narration_mode:
      patch.narration_mode !== undefined
        ? patch.narration_mode
        : current.narration_mode,
  };

  getDb()
    .prepare(
      `UPDATE narrations SET
        audio_storage_path = @audio_storage_path,
        recording_duration = @recording_duration,
        video_start_timestamp = @video_start_timestamp,
        notes = @notes,
        status = @status,
        narration_mode = @narration_mode,
        updated_at = datetime('now')
       WHERE id = @id`
    )
    .run({ id, ...next });

  return getNarrationById(id);
}

export function getDistinctProcedureTypes(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT procedure_type FROM videos ORDER BY procedure_type ASC`
    )
    .all() as Array<{ procedure_type: string }>;
  return rows.map((r) => r.procedure_type);
}
