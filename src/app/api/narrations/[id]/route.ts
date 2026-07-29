import { NextRequest, NextResponse } from "next/server";
import { canAccessVideo } from "@/lib/access";
import { getSessionUser, jsonError } from "@/lib/auth";
import { getNarrationById, getVideoById, updateNarration } from "@/lib/db";
import type { NarrationStatus } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const { id } = await context.params;
  const narration = getNarrationById(id);
  if (!narration) return jsonError("Narration not found", 404);
  if (!canAccessVideo(user, narration.video_id)) {
    return jsonError("Not authorized", 403);
  }
  if (user.role !== "admin" && narration.user_id !== user.id) {
    return jsonError("Not authorized", 403);
  }

  const video = getVideoById(narration.video_id);
  return NextResponse.json({ narration, video });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);

  const { id } = await context.params;
  const narration = getNarrationById(id);
  if (!narration) return jsonError("Narration not found", 404);
  if (narration.user_id !== user.id && user.role !== "admin") {
    return jsonError("Not authorized", 403);
  }

  const body = await req.json();
  const status = body.status as NarrationStatus | undefined;
  if (status && !["draft", "submitted"].includes(status)) {
    return jsonError("Invalid status");
  }

  const updated = updateNarration(id, {
    notes: body.notes !== undefined ? body.notes : undefined,
    status,
  });

  return NextResponse.json({ narration: updated });
}
