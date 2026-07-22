import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, jsonError } from "@/lib/auth";
import {
  getVideoById,
  listNarrationsForVideo,
  updateVideoDuration,
} from "@/lib/db";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const { id } = await context.params;
  const video = getVideoById(id);
  if (!video) return jsonError("Video not found", 404);

  const narrations = listNarrationsForVideo(id);
  return NextResponse.json({ video, narrations });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const { id } = await context.params;
  const video = getVideoById(id);
  if (!video) return jsonError("Video not found", 404);

  const body = await req.json();
  if (typeof body.duration === "number" && body.duration > 0) {
    updateVideoDuration(id, body.duration);
  }

  return NextResponse.json({ video: getVideoById(id) });
}
