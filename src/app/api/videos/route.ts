import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, jsonError } from "@/lib/auth";
import {
  ALLOWED_VIDEO_EXTENSIONS,
  ALLOWED_VIDEO_TYPES,
  MAX_VIDEO_BYTES,
} from "@/lib/config";
import { createVideo, listVideos, getDistinctProcedureTypes } from "@/lib/db";
import { extensionForMime } from "@/lib/format";
import { saveFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const { searchParams } = new URL(req.url);
  const videos = listVideos({
    search: searchParams.get("q") || undefined,
    procedure_type: searchParams.get("procedure") || undefined,
    status: searchParams.get("status") || undefined,
    userId: user.id,
  });

  return NextResponse.json({
    videos,
    procedures: getDistinctProcedureTypes(),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonError(
      `Expected multipart upload, got Content-Type: ${contentType || "(missing)"}`
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "parse failed";
    return jsonError(
      `Invalid multipart form data (${detail}). Try a smaller MP4/WebM file, or redeploy after the latest upload fix.`
    );
  }

  const title = String(form.get("title") || "").trim();
  const procedure_type = String(form.get("procedure_type") || "").trim();
  const description = String(form.get("description") || "").trim() || null;
  const case_id = String(form.get("case_id") || "").trim() || null;
  const durationRaw = form.get("duration");
  const duration =
    durationRaw != null && String(durationRaw) !== ""
      ? Number(durationRaw)
      : null;
  const file = form.get("file");

  if (!title || !procedure_type) {
    return jsonError("Title and procedure type are required");
  }
  if (!(file instanceof File)) {
    return jsonError("A video file is required");
  }
  if (file.size <= 0) return jsonError("Uploaded file is empty");
  if (file.size > MAX_VIDEO_BYTES) {
    return jsonError(
      `Video exceeds maximum size of ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB`
    );
  }

  const mime = file.type || "application/octet-stream";
  const nameLower = file.name.toLowerCase();
  const extOk = ALLOWED_VIDEO_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  const typeOk = (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime);

  if (!extOk && !typeOk) {
    return jsonError("Unsupported video format. Use MP4, WebM, or MOV.");
  }

  const id = randomUUID();
  const ext = extensionForMime(mime, extOk ? nameLower.slice(nameLower.lastIndexOf(".")) : ".mp4");
  const storagePath = `videos/${user.id}/${id}${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await saveFile(storagePath, buffer);

  const video = createVideo({
    id,
    title,
    procedure_type,
    description,
    case_id,
    video_storage_path: storagePath,
    duration: Number.isFinite(duration) ? duration : null,
    uploaded_by: user.id,
  });

  return NextResponse.json({ video }, { status: 201 });
}
