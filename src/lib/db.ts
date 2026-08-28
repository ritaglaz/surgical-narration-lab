import {
  execute,
  getDbBackend,
  nowSql,
  queryAll,
  queryOne,
  withTransaction,
} from "./db-engine";
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

export {
  closeDb,
  closeDbForRestore,
  ensureDbReady,
  getDbBackend,
  getDatabaseUrl,
  isProductionRuntime,
} from "./db-engine";

function iso(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: String(row.display_name),
    role: row.role as UserRole,
    created_at: iso(row.created_at),
  };
}

function mapVideo(row: Record<string, unknown>): Video {
  return {
    id: String(row.id),
    title: String(row.title),
    procedure_type: String(row.procedure_type),
    description: (row.description as string | null) ?? null,
    case_id: (row.case_id as string | null) ?? null,
    video_storage_path: String(row.video_storage_path),
    duration:
      row.duration == null || row.duration === ""
        ? null
        : Number(row.duration),
    uploaded_by: String(row.uploaded_by),
    created_at: iso(row.created_at),
    drive_video_file_id: (row.drive_video_file_id as string | null) ?? null,
    drive_sync_status:
      (row.drive_sync_status as Video["drive_sync_status"]) ?? null,
  };
}

function mapNarration(row: Record<string, unknown>): Narration {
  return {
    id: String(row.id),
    video_id: String(row.video_id),
    user_id: String(row.user_id),
    narration_mode: row.narration_mode as NarrationMode,
    audio_storage_path: (row.audio_storage_path as string | null) ?? null,
    recording_duration:
      row.recording_duration == null || row.recording_duration === ""
        ? null
        : Number(row.recording_duration),
    video_start_timestamp: Number(row.video_start_timestamp ?? 0),
    notes: (row.notes as string | null) ?? null,
    next_step: (row.next_step as string | null) ?? null,
    status: row.status as NarrationStatus,
    drive_sync_status: (row.drive_sync_status as Narration["drive_sync_status"]) ?? null,
    drive_audio_file_id: (row.drive_audio_file_id as string | null) ?? null,
    drive_synced_at: row.drive_synced_at ? iso(row.drive_synced_at) : null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function mapInvite(row: Record<string, unknown>): Invite {
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: (row.display_name as string | null) ?? null,
    token: String(row.token),
    invited_by: String(row.invited_by),
    accepted_at: row.accepted_at ? iso(row.accepted_at) : null,
    user_id: (row.user_id as string | null) ?? null,
    expires_at: iso(row.expires_at),
    created_at: iso(row.created_at),
  };
}

export async function createProfile(input: {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role?: UserRole;
}): Promise<Profile> {
  const role = input.role || "narrator";
  await execute(
    `INSERT INTO profiles (id, email, password_hash, display_name, role)
     VALUES (?, ?, ?, ?, ?)`,
    [input.id, input.email, input.password_hash, input.display_name, role]
  );
  const profile = await getProfileById(input.id);
  if (!profile) throw new Error("Failed to create profile");
  return profile;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT id, email, display_name, role, created_at FROM profiles WHERE id = ?`,
    [id]
  );
  return row ? mapProfile(row) : null;
}

export async function getProfileByEmail(
  email: string
): Promise<(Profile & { password_hash: string }) | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT id, email, password_hash, display_name, role, created_at
     FROM profiles WHERE LOWER(email) = LOWER(?)`,
    [email]
  );
  if (!row) return null;
  return {
    ...mapProfile(row),
    password_hash: String(row.password_hash ?? ""),
  };
}

export async function createVideo(input: {
  id: string;
  title: string;
  procedure_type: string;
  description?: string | null;
  case_id?: string | null;
  video_storage_path: string;
  duration?: number | null;
  uploaded_by: string;
}): Promise<Video> {
  await execute(
    `INSERT INTO videos
     (id, title, procedure_type, description, case_id, video_storage_path, duration, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.title,
      input.procedure_type,
      input.description ?? null,
      input.case_id ?? null,
      input.video_storage_path,
      input.duration ?? null,
      input.uploaded_by,
    ]
  );
  const video = await getVideoById(input.id);
  if (!video) throw new Error("Failed to create video");
  return video;
}

export async function getVideoById(id: string): Promise<Video | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM videos WHERE id = ?`,
    [id]
  );
  return row ? mapVideo(row) : null;
}

export async function listVideos(opts: {
  search?: string;
  procedure_type?: string;
  status?: string;
  userId?: string;
  assignedToUserId?: string;
}): Promise<VideoWithStats[]> {
  const clauses: string[] = [];
  const whereParams: unknown[] = [];

  if (opts.search) {
    clauses.push(
      `(v.title LIKE ? OR v.procedure_type LIKE ? OR COALESCE(v.case_id,'') LIKE ?)`
    );
    const q = `%${opts.search}%`;
    whereParams.push(q, q, q);
  }
  if (opts.procedure_type) {
    clauses.push(`v.procedure_type = ?`);
    whereParams.push(opts.procedure_type);
  }
  if (opts.assignedToUserId) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM video_assignments va
        WHERE va.video_id = v.id AND va.user_id = ?
      )`
    );
    whereParams.push(opts.assignedToUserId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const userFilterSql = opts.userId ? "AND n2.user_id = ?" : "";
  // Subquery placeholder appears before WHERE placeholders in the SQL text.
  const params: unknown[] = opts.userId
    ? [opts.userId, ...whereParams]
    : whereParams;

  // Explicit GROUP BY list for Postgres compatibility.
  const rows = await queryAll<Record<string, unknown>>(
    `
    SELECT
      v.id, v.title, v.procedure_type, v.description, v.case_id,
      v.video_storage_path, v.duration, v.uploaded_by, v.created_at,
      COUNT(n.id) AS narration_count,
      COALESCE(
        (SELECT n2.status FROM narrations n2
         WHERE n2.video_id = v.id
         ${userFilterSql}
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
    GROUP BY
      v.id, v.title, v.procedure_type, v.description, v.case_id,
      v.video_storage_path, v.duration, v.uploaded_by, v.created_at,
      p.display_name
    ORDER BY v.created_at DESC
  `,
    params
  );

  let result: VideoWithStats[] = rows.map((row) => ({
    ...mapVideo(row),
    narration_count: Number(row.narration_count || 0),
    narration_status: row.narration_status as VideoWithStats["narration_status"],
    uploader_name: row.uploader_name ? String(row.uploader_name) : undefined,
  }));

  if (opts.status && opts.status !== "all") {
    result = result.filter((r) => r.narration_status === opts.status);
  }
  return result;
}

export async function updateVideoDuration(id: string, duration: number) {
  await execute(`UPDATE videos SET duration = ? WHERE id = ?`, [duration, id]);
}

export async function updateVideoDriveFields(
  id: string,
  patch: {
    drive_video_file_id?: string | null;
    drive_sync_status?: string | null;
  }
) {
  const current = await getVideoById(id);
  if (!current) return null;
  await execute(
    `UPDATE videos SET
      drive_video_file_id = ?,
      drive_sync_status = ?
     WHERE id = ?`,
    [
      patch.drive_video_file_id !== undefined
        ? patch.drive_video_file_id
        : current.drive_video_file_id ?? null,
      patch.drive_sync_status !== undefined
        ? patch.drive_sync_status
        : current.drive_sync_status ?? null,
      id,
    ]
  );
  return getVideoById(id);
}

export async function createNarration(input: {
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
}): Promise<Narration> {
  await execute(
    `INSERT INTO narrations
     (id, video_id, user_id, narration_mode, audio_storage_path, recording_duration,
      video_start_timestamp, notes, next_step, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.video_id,
      input.user_id,
      input.narration_mode,
      input.audio_storage_path ?? null,
      input.recording_duration ?? null,
      input.video_start_timestamp ?? 0,
      input.notes ?? null,
      input.next_step ?? null,
      input.status ?? "draft",
    ]
  );
  const narration = await getNarrationById(input.id);
  if (!narration) throw new Error("Failed to create narration");
  return narration;
}

export async function getNarrationById(id: string): Promise<Narration | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM narrations WHERE id = ?`,
    [id]
  );
  return row ? mapNarration(row) : null;
}

export async function listNarrationsForVideo(
  videoId: string
): Promise<Array<Narration & { narrator_name: string; narrator_email: string }>> {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT n.*, p.display_name AS narrator_name, p.email AS narrator_email
     FROM narrations n
     JOIN profiles p ON p.id = n.user_id
     WHERE n.video_id = ?
     ORDER BY n.updated_at DESC`,
    [videoId]
  );
  return rows.map((row) => ({
    ...mapNarration(row),
    narrator_name: String(row.narrator_name || ""),
    narrator_email: String(row.narrator_email || ""),
  }));
}

export async function updateNarration(
  id: string,
  patch: Partial<{
    audio_storage_path: string | null;
    recording_duration: number | null;
    video_start_timestamp: number;
    notes: string | null;
    next_step: string | null;
    status: NarrationStatus;
    narration_mode: NarrationMode;
    drive_sync_status: string | null;
    drive_audio_file_id: string | null;
    drive_synced_at: string | null;
  }>
): Promise<Narration | null> {
  const current = await getNarrationById(id);
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
    drive_sync_status:
      patch.drive_sync_status !== undefined
        ? patch.drive_sync_status
        : current.drive_sync_status ?? "not_required",
    drive_audio_file_id:
      patch.drive_audio_file_id !== undefined
        ? patch.drive_audio_file_id
        : current.drive_audio_file_id ?? null,
    drive_synced_at:
      patch.drive_synced_at !== undefined
        ? patch.drive_synced_at
        : current.drive_synced_at ?? null,
  };

  await execute(
    `UPDATE narrations SET
      audio_storage_path = ?,
      recording_duration = ?,
      video_start_timestamp = ?,
      notes = ?,
      next_step = ?,
      status = ?,
      narration_mode = ?,
      drive_sync_status = ?,
      drive_audio_file_id = ?,
      drive_synced_at = ?,
      updated_at = ${nowSql()}
     WHERE id = ?`,
    [
      next.audio_storage_path,
      next.recording_duration,
      next.video_start_timestamp,
      next.notes,
      next.next_step,
      next.status,
      next.narration_mode,
      next.drive_sync_status,
      next.drive_audio_file_id,
      next.drive_synced_at,
      id,
    ]
  );

  return getNarrationById(id);
}

export async function getLatestNarrationForUserVideo(
  userId: string,
  videoId: string
): Promise<Narration | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM narrations
     WHERE user_id = ? AND video_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId, videoId]
  );
  return row ? mapNarration(row) : null;
}

export async function getDbStats(): Promise<{
  profiles: number;
  videos: number;
  narrations: number;
  invites: number;
}> {
  const profiles = Number(
    (await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM profiles`))?.c ||
      0
  );
  const videos = Number(
    (await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM videos`))?.c || 0
  );
  const narrations = Number(
    (await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM narrations`))
      ?.c || 0
  );
  const invites = Number(
    (await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM invites`))?.c || 0
  );
  return { profiles, videos, narrations, invites };
}

export async function getDistinctProcedureTypes(): Promise<string[]> {
  const rows = await queryAll<{ procedure_type: string }>(
    `SELECT DISTINCT procedure_type FROM videos ORDER BY procedure_type ASC`
  );
  return rows.map((r) => r.procedure_type);
}

export async function countProfiles(): Promise<number> {
  const row = await queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM profiles`);
  return Number(row?.c || 0);
}

export async function countAdmins(): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM profiles WHERE role = 'admin'`
  );
  return Number(row?.c || 0);
}

export async function canBootstrapAdmin(): Promise<boolean> {
  return (await countAdmins()) === 0;
}

export async function updateProfilePassword(
  userId: string,
  passwordHash: string
) {
  await execute(`UPDATE profiles SET password_hash = ? WHERE id = ?`, [
    passwordHash,
    userId,
  ]);
}

export async function setProfileRole(userId: string, role: UserRole) {
  await execute(`UPDATE profiles SET role = ? WHERE id = ?`, [role, userId]);
}

export async function userHasVideoAccess(
  userId: string,
  videoId: string
): Promise<boolean> {
  const row = await queryOne<{ ok: number }>(
    `SELECT 1 AS ok FROM video_assignments WHERE user_id = ? AND video_id = ?`,
    [userId, videoId]
  );
  return Boolean(row);
}

export async function assignVideoToUser(input: {
  id: string;
  video_id: string;
  user_id: string;
  invited_by: string;
}): Promise<VideoAssignment> {
  await execute(
    `INSERT INTO video_assignments (id, video_id, user_id, invited_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (video_id, user_id) DO NOTHING`,
    [input.id, input.video_id, input.user_id, input.invited_by]
  );
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM video_assignments WHERE video_id = ? AND user_id = ?`,
    [input.video_id, input.user_id]
  );
  if (!row) throw new Error("Failed to assign video");
  return {
    id: String(row.id),
    video_id: String(row.video_id),
    user_id: String(row.user_id),
    invited_by: String(row.invited_by),
    created_at: iso(row.created_at),
  };
}

export async function listAssigneesForVideo(videoId: string): Promise<
  Array<{
    user_id: string;
    email: string;
    display_name: string;
    assigned_at: string;
  }>
> {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT va.user_id, p.email, p.display_name, va.created_at AS assigned_at
     FROM video_assignments va
     JOIN profiles p ON p.id = va.user_id
     WHERE va.video_id = ?
     ORDER BY va.created_at DESC`,
    [videoId]
  );
  return rows.map((row) => ({
    user_id: String(row.user_id),
    email: String(row.email),
    display_name: String(row.display_name),
    assigned_at: iso(row.assigned_at),
  }));
}

export async function createInvite(input: {
  id: string;
  email: string;
  display_name?: string | null;
  token: string;
  invited_by: string;
  expires_at: string;
  video_ids: string[];
}): Promise<InviteWithVideos> {
  const email = input.email.trim().toLowerCase();
  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO invites (id, email, display_name, token, invited_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        email,
        input.display_name?.trim() || null,
        input.token,
        input.invited_by,
        input.expires_at,
      ]
    );
    for (const videoId of input.video_ids) {
      await tx.execute(
        `INSERT INTO invite_videos (invite_id, video_id) VALUES (?, ?)`,
        [input.id, videoId]
      );
    }
  });

  const invite = await getInviteByToken(input.token);
  if (!invite) throw new Error("Failed to create invite");
  return invite;
}

export async function getInviteByToken(
  token: string
): Promise<InviteWithVideos | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT * FROM invites WHERE token = ?`,
    [token]
  );
  if (!row) return null;
  const invite = mapInvite(row);

  const videos = await queryAll<{ video_id: string; title: string }>(
    `SELECT iv.video_id, v.title
     FROM invite_videos iv
     JOIN videos v ON v.id = iv.video_id
     WHERE iv.invite_id = ?`,
    [invite.id]
  );
  const inviter = await getProfileById(invite.invited_by);

  return {
    ...invite,
    video_ids: videos.map((v) => v.video_id),
    video_titles: videos.map((v) => v.title),
    invited_by_name: inviter?.display_name,
  };
}

export async function listInvites(): Promise<InviteWithVideos[]> {
  const invites = await queryAll<Record<string, unknown>>(
    `SELECT * FROM invites ORDER BY created_at DESC`
  );

  const result: InviteWithVideos[] = [];
  for (const row of invites) {
    const invite = mapInvite(row);
    const videos = await queryAll<{ video_id: string; title: string }>(
      `SELECT iv.video_id, v.title
       FROM invite_videos iv
       JOIN videos v ON v.id = iv.video_id
       WHERE iv.invite_id = ?`,
      [invite.id]
    );
    const inviter = await getProfileById(invite.invited_by);
    result.push({
      ...invite,
      video_ids: videos.map((v) => v.video_id),
      video_titles: videos.map((v) => v.title),
      invited_by_name: inviter?.display_name,
    });
  }
  return result;
}

export async function markInviteAccepted(inviteId: string, userId: string) {
  await execute(
    `UPDATE invites
     SET accepted_at = ${nowSql()}, user_id = ?
     WHERE id = ?`,
    [userId, inviteId]
  );
}

export async function updateProfileDisplayName(
  userId: string,
  displayName: string
) {
  await execute(`UPDATE profiles SET display_name = ? WHERE id = ?`, [
    displayName,
    userId,
  ]);
}

/** Safe diagnostic label for admins (never includes connection string). */
export function getPersistenceLabel(): string {
  try {
    return getDbBackend() === "postgres"
      ? "PostgreSQL (persistent)"
      : "SQLite (local / ephemeral on Render Free)";
  } catch {
    return "Database misconfigured";
  }
}
