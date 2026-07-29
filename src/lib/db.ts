import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDataDir } from "./config";
import type {
  Invite,
  InviteWithVideos,
  Narration,
  NarrationMode,
  NarrationStatus,
  Profile,
  UserRole,
  Video,
  VideoAssignment,
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
  // If a previous empty shell was created before Drive restore, prefer replacing
  // it only when the singleton has not been opened yet (this path).
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  migrate(dbInstance);
  return dbInstance;
}

/** Close DB so a Drive restore can replace the file on disk. */
export function closeDbForRestore() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
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
  `);

  ensureColumn(db, "narrations", "next_step", "TEXT");
}

function ensureColumn(
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
  /** When set, only return videos assigned to this user. */
  assignedToUserId?: string;
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
  if (opts.assignedToUserId) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM video_assignments va
        WHERE va.video_id = v.id AND va.user_id = @assignedToUserId
      )`
    );
    params.assignedToUserId = opts.assignedToUserId;
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
    .all(
      opts.userId ? { ...params, userId: opts.userId } : params
    ) as Array<
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
  next_step?: string | null;
  status?: NarrationStatus;
}): Narration {
  getDb()
    .prepare(
      `INSERT INTO narrations
       (id, video_id, user_id, narration_mode, audio_storage_path, recording_duration,
        video_start_timestamp, notes, next_step, status)
       VALUES (@id, @video_id, @user_id, @narration_mode, @audio_storage_path,
               @recording_duration, @video_start_timestamp, @notes, @next_step, @status)`
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
      next_step: input.next_step ?? null,
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
    next_step: string | null;
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
    next_step:
      patch.next_step !== undefined ? patch.next_step : current.next_step,
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
        next_step = @next_step,
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

export function countProfiles(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM profiles`)
    .get() as { c: number };
  return row.c;
}

export function countAdmins(): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM profiles WHERE role = 'admin'`)
    .get() as { c: number };
  return row.c;
}

export function canBootstrapAdmin(): boolean {
  return countAdmins() === 0;
}

export function updateProfilePassword(userId: string, passwordHash: string) {
  getDb()
    .prepare(`UPDATE profiles SET password_hash = ? WHERE id = ?`)
    .run(passwordHash, userId);
}

export function setProfileRole(userId: string, role: UserRole) {
  getDb()
    .prepare(`UPDATE profiles SET role = ? WHERE id = ?`)
    .run(role, userId);
}

export function userHasVideoAccess(userId: string, videoId: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM video_assignments WHERE user_id = ? AND video_id = ?`
    )
    .get(userId, videoId) as { ok: number } | undefined;
  return Boolean(row);
}

export function assignVideoToUser(input: {
  id: string;
  video_id: string;
  user_id: string;
  invited_by: string;
}): VideoAssignment {
  getDb()
    .prepare(
      `INSERT INTO video_assignments (id, video_id, user_id, invited_by)
       VALUES (@id, @video_id, @user_id, @invited_by)
       ON CONFLICT(video_id, user_id) DO NOTHING`
    )
    .run(input);
  return getDb()
    .prepare(
      `SELECT * FROM video_assignments WHERE video_id = ? AND user_id = ?`
    )
    .get(input.video_id, input.user_id) as VideoAssignment;
}

export function listAssigneesForVideo(videoId: string): Array<{
  user_id: string;
  email: string;
  display_name: string;
  assigned_at: string;
}> {
  return getDb()
    .prepare(
      `SELECT va.user_id, p.email, p.display_name, va.created_at AS assigned_at
       FROM video_assignments va
       JOIN profiles p ON p.id = va.user_id
       WHERE va.video_id = ?
       ORDER BY va.created_at DESC`
    )
    .all(videoId) as Array<{
    user_id: string;
    email: string;
    display_name: string;
    assigned_at: string;
  }>;
}

export function createInvite(input: {
  id: string;
  email: string;
  display_name?: string | null;
  token: string;
  invited_by: string;
  expires_at: string;
  video_ids: string[];
}): InviteWithVideos {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  db.prepare(
    `INSERT INTO invites (id, email, display_name, token, invited_by, expires_at)
     VALUES (@id, @email, @display_name, @token, @invited_by, @expires_at)`
  ).run({
    id: input.id,
    email,
    display_name: input.display_name?.trim() || null,
    token: input.token,
    invited_by: input.invited_by,
    expires_at: input.expires_at,
  });

  const insertVideo = db.prepare(
    `INSERT INTO invite_videos (invite_id, video_id) VALUES (?, ?)`
  );
  for (const videoId of input.video_ids) {
    insertVideo.run(input.id, videoId);
  }

  return getInviteByToken(input.token)!;
}

export function getInviteByToken(token: string): InviteWithVideos | null {
  const invite = getDb()
    .prepare(`SELECT * FROM invites WHERE token = ?`)
    .get(token) as Invite | undefined;
  if (!invite) return null;

  const videos = getDb()
    .prepare(
      `SELECT iv.video_id, v.title
       FROM invite_videos iv
       JOIN videos v ON v.id = iv.video_id
       WHERE iv.invite_id = ?`
    )
    .all(invite.id) as Array<{ video_id: string; title: string }>;

  const inviter = getProfileById(invite.invited_by);

  return {
    ...invite,
    video_ids: videos.map((v) => v.video_id),
    video_titles: videos.map((v) => v.title),
    invited_by_name: inviter?.display_name,
  };
}

export function listInvites(): InviteWithVideos[] {
  const invites = getDb()
    .prepare(`SELECT * FROM invites ORDER BY created_at DESC`)
    .all() as Invite[];

  return invites.map((invite) => {
    const videos = getDb()
      .prepare(
        `SELECT iv.video_id, v.title
         FROM invite_videos iv
         JOIN videos v ON v.id = iv.video_id
         WHERE iv.invite_id = ?`
      )
      .all(invite.id) as Array<{ video_id: string; title: string }>;
    const inviter = getProfileById(invite.invited_by);
    return {
      ...invite,
      video_ids: videos.map((v) => v.video_id),
      video_titles: videos.map((v) => v.title),
      invited_by_name: inviter?.display_name,
    };
  });
}

export function markInviteAccepted(inviteId: string, userId: string) {
  getDb()
    .prepare(
      `UPDATE invites
       SET accepted_at = datetime('now'), user_id = ?
       WHERE id = ?`
    )
    .run(userId, inviteId);
}

export function updateProfileDisplayName(userId: string, displayName: string) {
  getDb()
    .prepare(`UPDATE profiles SET display_name = ? WHERE id = ?`)
    .run(displayName, userId);
}
