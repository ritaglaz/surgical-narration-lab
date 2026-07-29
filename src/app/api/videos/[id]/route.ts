import { NextRequest, NextResponse } from "next/server";
import { canAccessVideo, isAdmin } from "@/lib/access";
import { getSessionUser, jsonError } from "@/lib/auth";
import {
  getVideoById,
  listAssigneesForVideo,
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
  if (!canAccessVideo(user, id)) return jsonError("Not authorized", 403);

  const allNarrations = listNarrationsForVideo(id);
  const admin = isAdmin(user);
  const narrations = admin
    ? allNarrations
    : allNarrations.filter((n) => n.user_id === user.id);

  return NextResponse.json({
    video,
    narrations,
    assignees: admin ? listAssigneesForVideo(id) : undefined,
  });
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
  if (!canAccessVideo(user, id)) return jsonError("Not authorized", 403);

  const body = await req.json();
  if (typeof body.duration === "number" && body.duration > 0) {
    updateVideoDuration(id, body.duration);
  }

  return NextResponse.json({ video: getVideoById(id) });
}
