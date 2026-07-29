import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canUploadVideos, isAdmin } from "@/lib/access";
import { getSessionUser, jsonError } from "@/lib/auth";
import {
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_TYPES,
  MAX_VIDEO_BYTES,
} from "@/lib/config";
import { createVideo, listVideos, getDistinctProcedureTypes } from "@/lib/db";
import { extensionForMime } from "@/lib/format";
import { parseMultipartToDisk } from "@/lib/multipart";
import { deleteFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow longer uploads on hosted platforms */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const { searchParams } = new URL(req.url);
  const videos = listVideos({
    search: searchParams.get("q") || undefined,
    procedure_type: searchParams.get("procedure") || undefined,
    status: searchParams.get("status") || undefined,
    userId: user.id,
    // Shared admin library: do not scope by assignment/uploader.
    assignedToUserId: isAdmin(user) ? undefined : user.id,
  });

  return NextResponse.json({
    videos,
    procedures: getDistinctProcedureTypes(),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);
  if (!canUploadVideos(user)) {
    return jsonError("Only admins can upload videos", 403);
  }

  const id = randomUUID();

  let parsed;
  try {
    parsed = await parseMultipartToDisk(req, {
      fileField: "file",
      maxFileBytes: MAX_VIDEO_BYTES,
      buildStoragePath: ({ filename, mimeType }) => {
        const nameLower = filename.toLowerCase();
        const extOk = ALLOWED_VIDEO_EXTENSIONS.some((ext) =>
          nameLower.endsWith(ext)
        );
        const ext = extensionForMime(
          mimeType,
          extOk ? nameLower.slice(nameLower.lastIndexOf(".")) : ".mp4"
        );
        return `videos/${user.id}/${id}${ext}`;
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload parse failed";
    console.error("[upload]", message);
    return jsonError(message, 400);
  }

  const title = String(parsed.fields.title || "").trim();
  const procedure_type = String(parsed.fields.procedure_type || "").trim();
  const description = String(parsed.fields.description || "").trim() || null;
  const case_id = String(parsed.fields.case_id || "").trim() || null;
  const durationRaw = parsed.fields.duration;
  const duration =
    durationRaw != null && durationRaw !== "" ? Number(durationRaw) : null;

  if (!title || !procedure_type) {
    if (parsed.file) deleteFile(parsed.file.storagePath);
    return jsonError("Title and procedure type are required");
  }
  if (!parsed.file || parsed.file.size <= 0) {
    if (parsed.file) deleteFile(parsed.file.storagePath);
    return jsonError("A video file is required");
  }

  const mime = parsed.file.mimeType || "application/octet-stream";
  const nameLower = parsed.file.filename.toLowerCase();
  const extOk = ALLOWED_VIDEO_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  const typeOk = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime);

  if (!extOk && !typeOk) {
    deleteFile(parsed.file.storagePath);
    return jsonError("Unsupported video format. Use MP4, WebM, or MOV.");
  }

  try {
    const video = createVideo({
      id,
      title,
      procedure_type,
      description,
      case_id,
      video_storage_path: parsed.file.storagePath,
      duration: Number.isFinite(duration as number) ? duration : null,
      uploaded_by: user.id,
    });

    const { queueDriveSync, syncVideoMetadataToDrive } = await import(
      "@/lib/google-drive"
    );
    queueDriveSync(() => syncVideoMetadataToDrive(video));

    return NextResponse.json({ video }, { status: 201 });
  } catch (err) {
    deleteFile(parsed.file.storagePath);
    console.error("[upload] db error", err);
    return jsonError("Failed to save video metadata", 500);
  }
}
