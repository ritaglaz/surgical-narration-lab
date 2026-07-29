import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { getDataDir } from "./config";
import {
  getProfileById,
  getVideoById,
  listAssigneesForVideo,
  listNarrationsForVideo,
  listVideos,
} from "./db";
import { readFileBuffer } from "./storage";
import type { Narration, Video } from "./types";

type DriveIndex = Record<string, string>; // logicalName -> driveFileId

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

async function upsertFile(opts: {
  logicalName: string;
  filename: string;
  mimeType: string;
  body: Buffer | string;
}): Promise<string> {
  const drive = await getDrive();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID!;
  const index = readIndex();
  const existingId = index[opts.logicalName];
  const mediaBody =
    typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : opts.body;

  if (existingId) {
    try {
      await drive.files.update({
        fileId: existingId,
        media: {
          mimeType: opts.mimeType,
          body: Readable.from(mediaBody),
        },
        supportsAllDrives: true,
      });
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
      body: Readable.from(mediaBody),
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const id = created.data.id;
  if (!id) throw new Error("Drive upload returned no file id");
  index[opts.logicalName] = id;
  writeIndex(index);
  return id;
}

function buildManifest() {
  const videos = listVideos({});
  return {
    exported_at: new Date().toISOString(),
    note: "Videos themselves are not uploaded to Drive — only metadata + narration audio.",
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
  }

  await upsertFile({
    logicalName: `narrations/${narration.id}.json`,
    filename: `narration-${narration.id}.json`,
    mimeType: "application/json",
    body: JSON.stringify(
      {
        ...narration,
        narrator_name: narrator?.display_name || null,
        narrator_email: narrator?.email || null,
        narrator_role: narrator?.role || null,
        narrator_user_id: narration.user_id,
        video_title: video?.title || null,
        video_procedure_type: video?.procedure_type || null,
        video_case_id: video?.case_id || null,
        drive_audio_file_id: audioDriveId || null,
        synced_at: new Date().toISOString(),
      },
      null,
      2
    ),
  });

  if (video) await syncVideoMetadataToDrive(video);
  else await syncManifestToDrive();

  return { audioDriveId };
}

/** Fire-and-forget helper so API responses are not blocked on Drive errors. */
export function queueDriveSync(task: () => Promise<unknown>) {
  if (!driveEnabled()) return;
  task().catch((err) => {
    console.error("[google-drive] sync failed:", err);
  });
}
