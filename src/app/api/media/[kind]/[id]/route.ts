import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { canAccessVideo, isAdmin } from "@/lib/access";
import { getSessionUser, jsonError } from "@/lib/auth";
import { getNarrationById, getVideoById } from "@/lib/db";
import { contentTypeForPath, fileExists, resolveStoragePath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allow time to restore large media from Google Drive after Render disk wipe. */
export const maxDuration = 300;

/**
 * Authenticated media proxy.
 * Paths are looked up via DB ownership — guessing a URL alone is not enough
 * without a valid session, and we verify the path belongs to a known record.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const { kind, id } = await context.params;

  let storagePath: string | null = null;
  let driveFileId: string | null = null;

  if (kind === "video") {
    const video = await getVideoById(id);
    if (!video) return jsonError("Not found", 404);
    if (!(await canAccessVideo(user, id))) return jsonError("Not authorized", 403);
    storagePath = video.video_storage_path;
    driveFileId = video.drive_video_file_id ?? null;
  } else if (kind === "audio") {
    const narration = await getNarrationById(id);
    if (!narration || !narration.audio_storage_path) {
      return jsonError("Not found", 404);
    }
    if (!(await canAccessVideo(user, narration.video_id))) {
      return jsonError("Not authorized", 403);
    }
    if (!isAdmin(user) && narration.user_id !== user.id) {
      return jsonError("Not authorized", 403);
    }
    storagePath = narration.audio_storage_path;
    driveFileId = narration.drive_audio_file_id ?? null;
  } else {
    return jsonError("Invalid media kind", 400);
  }

  if (!storagePath) {
    return jsonError("File not found", 404);
  }

  if (!fileExists(storagePath)) {
    const { ensureLocalFileFromDrive } = await import("@/lib/google-drive");
    const restored = await ensureLocalFileFromDrive(storagePath, {
      id,
      kind: kind === "audio" ? "audio" : "video",
      driveFileId,
    });
    if (!restored) {
      console.error("[media] file missing locally and not restored from Drive", {
        kind,
        id,
        storagePath,
        driveFileId,
      });
      return jsonError(
        kind === "video"
          ? "Video file is missing from the server. An admin must re-upload this video (and wait for Google Drive sync)."
          : "Audio file is missing from the server.",
        404
      );
    }
  }

  const abs = resolveStoragePath(storagePath);
  const stat = fs.statSync(abs);
  const contentType = contentTypeForPath(storagePath);
  const range = req.headers.get("range");

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(abs, { start, end });
      return new NextResponse(stream as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
          "Cache-Control": "private, no-store",
        },
      });
    }
  }

  const stream = fs.createReadStream(abs);
  return new NextResponse(stream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    },
  });
}
