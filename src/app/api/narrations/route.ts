import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { canAccessVideo } from "@/lib/access";
import { getSessionUser, jsonError } from "@/lib/auth";
import { MAX_AUDIO_BYTES } from "@/lib/config";
import {
  createNarration,
  getNarrationById,
  getVideoById,
  updateNarration,
} from "@/lib/db";
import { extensionForMime } from "@/lib/format";
import { deleteFile, saveFile } from "@/lib/storage";
import type { NarrationMode, NarrationStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "parse failed";
    return jsonError(`Invalid multipart form data (${detail})`);
  }

  const video_id = String(form.get("video_id") || "");
  const narration_mode = String(
    form.get("narration_mode") || "dictation"
  ) as NarrationMode;
  const status = (String(form.get("status") || "draft") ||
    "draft") as NarrationStatus;
  const notes = String(form.get("notes") || "").trim() || null;
  const next_step = String(form.get("next_step") || "").trim() || null;
  const video_start_timestamp = Number(form.get("video_start_timestamp") || 0);
  const recording_durationRaw = form.get("recording_duration");
  const recording_duration =
    recording_durationRaw != null && String(recording_durationRaw) !== ""
      ? Number(recording_durationRaw)
      : null;
  const existingId = String(form.get("narration_id") || "") || null;
  const file = form.get("file");

  if (!video_id) return jsonError("video_id is required");
  // New recordings are always post-video dictation.
  if (narration_mode !== "dictation") {
    return jsonError("Only post-video dictation is supported");
  }
  if (!["draft", "submitted"].includes(status)) {
    return jsonError("status must be draft or submitted");
  }
  if (status === "submitted" && !next_step) {
    return jsonError(
      "Please describe the next step of the operation before submitting"
    );
  }

  const video = getVideoById(video_id);
  if (!video) return jsonError("Video not found", 404);
  if (!canAccessVideo(user, video_id)) {
    return jsonError("Not authorized to narrate this video", 403);
  }

  if (!(file instanceof File) && !existingId) {
    return jsonError("Audio file is required for a new narration");
  }

  let audioBuffer: Buffer | null = null;
  let mime = "audio/webm";

  if (file instanceof File) {
    if (file.size <= 0) return jsonError("Audio file is empty");
    if (file.size > MAX_AUDIO_BYTES) {
      return jsonError(
        `Audio exceeds maximum size of ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB`
      );
    }
    mime = file.type || "audio/webm";
    audioBuffer = Buffer.from(await file.arrayBuffer());
  }

  if (existingId) {
    const existing = getNarrationById(existingId);
    if (!existing) return jsonError("Narration not found", 404);
    if (existing.user_id !== user.id && user.role !== "admin") {
      return jsonError("Not authorized to update this narration", 403);
    }

    let audio_storage_path: string | undefined;
    if (audioBuffer) {
      const ext = extensionForMime(mime, ".webm");
      audio_storage_path = `audio/${user.id}/${video_id}/${existingId}${ext}`;
      await saveFile(audio_storage_path, audioBuffer);
      if (
        existing.audio_storage_path &&
        existing.audio_storage_path !== audio_storage_path
      ) {
        deleteFile(existing.audio_storage_path);
      }
    }

    const updated = updateNarration(existingId, {
      audio_storage_path,
      recording_duration,
      video_start_timestamp: Number.isFinite(video_start_timestamp)
        ? video_start_timestamp
        : 0,
      notes,
      next_step,
      status,
      narration_mode,
    });

    if (updated) {
      const { queueDriveSync, syncNarrationToDrive } = await import(
        "@/lib/google-drive"
      );
      queueDriveSync(() => syncNarrationToDrive(updated));
    }

    return NextResponse.json({ narration: updated });
  }

  const id = randomUUID();
  const ext = extensionForMime(mime, ".webm");
  const audio_storage_path = `audio/${user.id}/${video_id}/${id}${ext}`;
  await saveFile(audio_storage_path, audioBuffer!);

  const narration = createNarration({
    id,
    video_id,
    user_id: user.id,
    narration_mode,
    audio_storage_path,
    recording_duration: Number.isFinite(recording_duration as number)
      ? recording_duration
      : null,
    video_start_timestamp: Number.isFinite(video_start_timestamp)
      ? video_start_timestamp
      : 0,
    notes,
    next_step,
    status,
  });

  const { queueDriveSync, syncNarrationToDrive } = await import(
    "@/lib/google-drive"
  );
  queueDriveSync(() => syncNarrationToDrive(narration));

  return NextResponse.json({ narration }, { status: 201 });
}
