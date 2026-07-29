import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { DICTATION_PROMPT, getDataDir } from "./config";
import {
  getDb,
  closeDbForRestore,
  getProfileById,
  getVideoById,
  listAssigneesForVideo,
  listNarrationsForVideo,
  listVideos,
} from "./db";
import {
  contentTypeForPath,
  fileExists,
  readFileBuffer,
  resolveStoragePath,
} from "./storage";
import type { Narration, Video } from "./types";

type DriveIndex = Record<string, string>; // logicalName -> driveFileId

const DB_LOGICAL = "app.db";
const DB_FILENAME = "snl-app.db";
const INDEX_LOGICAL = "drive-index.json";
const INDEX_FILENAME = "snl-drive-index.json";

function hasServiceAccount() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH
  );
}

function hasOAuth() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function driveEnabled(): boolean {
  if (process.env.GOOGLE_DRIVE_SYNC === "false") return false;
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) return false;
  return hasOAuth() || hasServiceAccount();
}

export function isGoogleDriveConfigured(): boolean {
  return driveEnabled();
}

function loadServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    return JSON.parse(raw) as {
      client_email: string;
      private_key: string;
    };
  }
  const p = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH;
  if (p) {
    return JSON.parse(fs.readFileSync(p, "utf8")) as {
      client_email: string;
      private_key: string;
    };
  }
  throw new Error("Google service account credentials are not configured");
}

async function getDrive() {
  // Prefer OAuth for personal Gmail / My Drive (service accounts have no quota there).
  if (hasOAuth()) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    oauth2.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    });
    return google.drive({ version: "v3", auth: oauth2 });
  }

  const credentials = loadServiceAccount();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  return google.drive({ version: "v3", auth });
}

function indexPath() {
  const dir = path.resolve(getDataDir());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "drive-index.json");
}

function dbPath() {
  const dir = path.resolve(getDataDir());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "app.db");
}

function readIndex(): DriveIndex {
  try {
    return JSON.parse(fs.readFileSync(indexPath(), "utf8")) as DriveIndex;
  } catch {
    return {};
  }
}

function writeIndex(index: DriveIndex) {
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2));
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFileIdByName(filename: string): Promise<string | undefined> {
  const drive = await getDrive();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const res = await drive.files.list({
    q: `'${folderId}' in parents and name='${escapeDriveQuery(filename)}' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || undefined;
}

async function resolveFileId(
  logicalName: string,
  filename: string
): Promise<string | undefined> {
  const index = readIndex();
  if (index[logicalName]) return index[logicalName];
  const found = await findFileIdByName(filename);
  if (found) {
    index[logicalName] = found;
    writeIndex(index);
  }
  return found;
}

async function downloadFileToPath(fileId: string, destPath: string) {
  const drive = await getDrive();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  await new Promise<void>((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    (res.data as Readable)
      .on("error", reject)
      .pipe(dest)
      .on("finish", () => resolve())
      .on("error", reject);
  });
}

async function upsertFile(opts: {
  logicalName: string;
  filename: string;
  mimeType: string;
  body: Buffer | string | Readable;
  /** If set, body streams are re-opened from this path on create-after-failed-update. */
  filePath?: string;
  /** Skip uploading drive-index.json (used when syncing the index itself). */
  skipIndexBackup?: boolean;
}): Promise<string> {
  const drive = await getDrive();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const index = readIndex();
  const existingId =
    index[opts.logicalName] || (await findFileIdByName(opts.filename));

  const toMediaBody = () => {
    if (opts.filePath) return fs.createReadStream(opts.filePath);
    return typeof opts.body === "string"
      ? Buffer.from(opts.body, "utf8")
      : opts.body;
  };

  if (existingId) {
    try {
      await drive.files.update({
        fileId: existingId,
        media: {
          mimeType: opts.mimeType,
          body: toMediaBody(),
        },
        supportsAllDrives: true,
      });
      index[opts.logicalName] = existingId;
      writeIndex(index);
      if (!opts.skipIndexBackup) await backupDriveIndex();
      return existingId;
    } catch {
      // fall through to create if update fails (file deleted manually)
    }
  }

  const created = await drive.files.create({
    requestBody: {
      name: opts.filename,
      parents: [folderId],
    },
    media: {
      mimeType: opts.mimeType,
      body: toMediaBody(),
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const id = created.data.id;
  if (!id) throw new Error("Drive upload returned no file id");
  index[opts.logicalName] = id;
  writeIndex(index);
  if (!opts.skipIndexBackup) await backupDriveIndex();
  return id;
}

async function backupDriveIndex() {
  if (!driveEnabled()) return;
  const index = readIndex();
  // Avoid recursion: write index without triggering another index backup.
  await upsertFile({
    logicalName: INDEX_LOGICAL,
    filename: INDEX_FILENAME,
    mimeType: "application/json",
    body: JSON.stringify(index, null, 2),
    skipIndexBackup: true,
  });
}

async function hydrateDriveIndexFromDrive() {
  if (!driveEnabled()) return;
  const local = readIndex();
  if (Object.keys(local).length > 0) return;

  const fileId = await findFileIdByName(INDEX_FILENAME);
  if (!fileId) return;
  try {
    const tmp = path.join(getDataDir(), ".drive-index-restore.json");
    await downloadFileToPath(fileId, tmp);
    const remote = JSON.parse(fs.readFileSync(tmp, "utf8")) as DriveIndex;
    fs.unlinkSync(tmp);
    writeIndex({ ...remote, [INDEX_LOGICAL]: fileId });
  } catch (err) {
    console.error("[google-drive] failed to hydrate index:", err);
  }
}

function localDbHasUserData(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  try {
    if (fs.statSync(file).size < 200) return false;
    // Open read-only without going through the app singleton.
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const probe = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const row = probe
        .prepare(
          `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='profiles'`
        )
        .get() as { c: number };
      if (!row?.c) return false;
      const users = probe
        .prepare(`SELECT COUNT(*) AS c FROM profiles`)
        .get() as { c: number };
      return (users?.c ?? 0) > 0;
    } finally {
      probe.close();
    }
  } catch {
    return false;
  }
}

/**
 * Restore SQLite + Drive index after Render free-tier filesystem wipe.
 * Safe to call multiple times; runs once per process.
 */
let restorePromise: Promise<void> | null = null;

export function ensurePersistenceRestored(): Promise<void> {
  if (!restorePromise) {
    restorePromise = restorePersistenceFromDrive().catch((err) => {
      console.error("[google-drive] restore failed:", err);
      // Allow retry on next request if boot restore failed.
      restorePromise = null;
    });
  }
  return restorePromise ?? Promise.resolve();
}

export async function restorePersistenceFromDrive(): Promise<void> {
  if (!driveEnabled()) {
    console.warn(
      "[persistence] Google Drive sync is not configured — logins/videos will be lost on Render Free restarts. Set GOOGLE_DRIVE_* env vars or attach a persistent disk."
    );
    return;
  }

  await hydrateDriveIndexFromDrive();

  const localDb = dbPath();
  const fileId = await resolveFileId(DB_LOGICAL, DB_FILENAME);
  if (!fileId) {
    console.log("[persistence] no Drive SQLite backup found yet");
    return;
  }

  if (localDbHasUserData(localDb)) {
    console.log("[persistence] local SQLite has accounts; skipping Drive DB restore");
    return;
  }

  // Close any in-memory handle before replacing the file.
  closeDbForRestore();

  // Clear WAL sidecars so a restored main DB is authoritative.
  for (const side of [`${localDb}-wal`, `${localDb}-shm`]) {
    try {
      if (fs.existsSync(side)) fs.unlinkSync(side);
    } catch {
      // ignore
    }
  }

  await downloadFileToPath(fileId, localDb);
  console.log("[persistence] restored SQLite database from Google Drive");
}

/** Checkpoint WAL and upload app.db so accounts/invites survive Render sleep. */
export async function syncDatabaseToDrive(): Promise<void> {
  if (!driveEnabled()) return;
  const db = getDb();
  db.pragma("wal_checkpoint(TRUNCATE)");
  const localDb = dbPath();
  if (!fs.existsSync(localDb)) return;
  await upsertFile({
    logicalName: DB_LOGICAL,
    filename: DB_FILENAME,
    mimeType: "application/x-sqlite3",
    body: fs.readFileSync(localDb),
    filePath: localDb,
  });
}

let dbSyncTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced DB backup — call after signup, invite, upload, narration save. */
export function queueDatabaseSync() {
  if (!driveEnabled()) return;
  if (dbSyncTimer) clearTimeout(dbSyncTimer);
  dbSyncTimer = setTimeout(() => {
    syncDatabaseToDrive().catch((err) => {
      console.error("[google-drive] database sync failed:", err);
    });
  }, 1200);
}

function mediaLogicalName(storagePath: string) {
  return `media/${storagePath.replace(/\\/g, "/")}`;
}

function mediaDriveFilename(storagePath: string, id: string) {
  const ext = path.extname(storagePath) || ".bin";
  const kind = storagePath.includes("/audio/") ? "audio" : "video";
  return `${kind}-${id}${ext}`;
}

/** Upload the actual video bytes (not just JSON metadata). */
export async function syncVideoFileToDrive(video: Video): Promise<void> {
  if (!driveEnabled()) return;
  if (!fileExists(video.video_storage_path)) return;
  const abs = resolveStoragePath(video.video_storage_path);
  await upsertFile({
    logicalName: mediaLogicalName(video.video_storage_path),
    filename: mediaDriveFilename(video.video_storage_path, video.id),
    mimeType: contentTypeForPath(video.video_storage_path),
    body: fs.createReadStream(abs),
    filePath: abs,
  });
  await syncVideoMetadataToDrive(video);
  await syncDatabaseToDrive();
}

/**
 * If a media file was wiped from local disk, pull it back from Drive.
 * Returns true when the file exists locally afterward.
 */
export async function ensureLocalFileFromDrive(
  storagePath: string,
  opts?: { id?: string; kind?: "video" | "audio" }
): Promise<boolean> {
  if (fileExists(storagePath)) return true;
  if (!driveEnabled()) return false;

  await hydrateDriveIndexFromDrive();

  const candidates: Array<{ logical: string; filename: string }> = [
    {
      logical: mediaLogicalName(storagePath),
      filename: opts?.id
        ? mediaDriveFilename(storagePath, opts.id)
        : path.basename(storagePath),
    },
  ];

  if (opts?.kind === "audio" && opts.id) {
    const ext = path.extname(storagePath) || ".webm";
    candidates.push({
      logical: `audio/${opts.id}${ext}`,
      filename: `narration-${opts.id}${ext}`,
    });
  }

  for (const c of candidates) {
    const fileId = await resolveFileId(c.logical, c.filename);
    if (!fileId) continue;
    try {
      const abs = resolveStoragePath(storagePath);
      await downloadFileToPath(fileId, abs);
      return fileExists(storagePath);
    } catch (err) {
      console.error("[google-drive] media restore failed:", err);
    }
  }
  return false;
}

function buildManifest() {
  const videos = listVideos({});
  return {
    exported_at: new Date().toISOString(),
    note: "SQLite (snl-app.db), videos, audio, and JSON metadata are synced for Free Render durability.",
    videos: videos.map((v) => {
      const narrations = listNarrationsForVideo(v.id).map((n) => ({
        id: n.id,
        user_id: n.user_id,
        narrator_name: n.narrator_name,
        narrator_email: n.narrator_email,
        narration_mode: n.narration_mode,
        status: n.status,
        recording_duration: n.recording_duration,
        video_start_timestamp: n.video_start_timestamp,
        notes: n.notes,
        audio_storage_path: n.audio_storage_path,
        drive_audio_logical_name: n.audio_storage_path
          ? `audio/${n.id}${path.extname(n.audio_storage_path) || ".webm"}`
          : null,
        created_at: n.created_at,
        updated_at: n.updated_at,
      }));
      return {
        id: v.id,
        title: v.title,
        procedure_type: v.procedure_type,
        description: v.description,
        case_id: v.case_id,
        duration: v.duration,
        uploaded_by: v.uploaded_by,
        uploader_name: v.uploader_name,
        video_storage_path: v.video_storage_path,
        created_at: v.created_at,
        narration_count: v.narration_count,
        assignees: listAssigneesForVideo(v.id),
        narrations,
      };
    }),
  };
}

export async function syncManifestToDrive(): Promise<void> {
  if (!driveEnabled()) return;
  const manifest = buildManifest();
  await upsertFile({
    logicalName: "manifest.json",
    filename: "manifest.json",
    mimeType: "application/json",
    body: JSON.stringify(manifest, null, 2),
  });
}

export async function syncVideoMetadataToDrive(video: Video): Promise<void> {
  if (!driveEnabled()) return;
  const uploader = getProfileById(video.uploaded_by);
  const narrations = listNarrationsForVideo(video.id);
  const assignees = listAssigneesForVideo(video.id);
  const payload = {
    ...video,
    uploader_email: uploader?.email || null,
    uploader_name: uploader?.display_name || null,
    assignees,
    narrations: narrations.map((n) => ({
      ...n,
      narrator_role: getProfileById(n.user_id)?.role || null,
    })),
    updated_at: new Date().toISOString(),
  };
  await upsertFile({
    logicalName: `videos/${video.id}.json`,
    filename: `video-${video.id}.json`,
    mimeType: "application/json",
    body: JSON.stringify(payload, null, 2),
  });
  await syncManifestToDrive();
}

export async function syncNarrationToDrive(
  narration: Narration
): Promise<{ audioDriveId?: string }> {
  if (!driveEnabled()) return {};

  const video = getVideoById(narration.video_id);
  const narrator = getProfileById(narration.user_id);
  let audioDriveId: string | undefined;

  if (narration.audio_storage_path) {
    const ext = path.extname(narration.audio_storage_path) || ".webm";
    const buf = readFileBuffer(narration.audio_storage_path);
    const mime =
      ext === ".mp3"
        ? "audio/mpeg"
        : ext === ".wav"
          ? "audio/wav"
          : ext === ".m4a" || ext === ".mp4"
            ? "audio/mp4"
            : "audio/webm";
    audioDriveId = await upsertFile({
      logicalName: `audio/${narration.id}${ext}`,
      filename: `narration-${narration.id}${ext}`,
      mimeType: mime,
      body: buf,
    });
    // Also index under media/ path for generic restore.
    const index = readIndex();
    if (audioDriveId) {
      index[mediaLogicalName(narration.audio_storage_path)] = audioDriveId;
      writeIndex(index);
    }
  }

  await upsertFile({
    logicalName: `narrations/${narration.id}.json`,
    filename: `narration-${narration.id}.json`,
    mimeType: "application/json",
    body: JSON.stringify(
      {
        ...narration,
        dictation_prompt: DICTATION_PROMPT,
        narrator_name: narrator?.display_name || null,
        narrator_email: narrator?.email || null,
        narrator_role: narrator?.role || null,
        narrator_user_id: narration.user_id,
        video_title: video?.title || null,
        video_procedure_type: video?.procedure_type || null,
        video_case_id: video?.case_id || null,
        next_step: narration.next_step || null,
        drive_audio_file_id: audioDriveId || null,
        synced_at: new Date().toISOString(),
      },
      null,
      2
    ),
  });

  if (video) await syncVideoMetadataToDrive(video);
  else await syncManifestToDrive();

  await syncDatabaseToDrive();
  return { audioDriveId };
}

/** Fire-and-forget helper so API responses are not blocked on Drive errors. */
export function queueDriveSync(task: () => Promise<unknown>) {
  if (!driveEnabled()) return;
  task().catch((err) => {
    console.error("[google-drive] sync failed:", err);
  });
}
