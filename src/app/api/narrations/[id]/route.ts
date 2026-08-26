import { NextRequest, NextResponse } from "next/server";
import { canAccessVideo, isAdmin } from "@/lib/access";
import { getSessionUser, jsonError } from "@/lib/auth";
import { getNarrationById, getVideoById, updateNarration } from "@/lib/db";
import { isGoogleDriveConfigured } from "@/lib/google-drive";
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
  if (!isAdmin(user) && narration.user_id !== user.id) {
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
  if (narration.user_id !== user.id && !isAdmin(user)) {
    return jsonError("Not authorized", 403);
  }

  const body = await req.json();
  const status = body.status as NarrationStatus | undefined;
  if (status && !["draft", "submitted"].includes(status)) {
    return jsonError("Invalid status");
  }
  const next_step =
    body.next_step !== undefined
      ? String(body.next_step || "").trim() || null
      : undefined;
  if (status === "submitted") {
    const step = next_step !== undefined ? next_step : narration.next_step;
    if (!step) {
      return jsonError(
        "Please describe the next step of the operation before submitting"
      );
    }
  }

  const updated = updateNarration(id, {
    notes: body.notes !== undefined ? body.notes : undefined,
    next_step,
    status,
    drive_sync_status: "pending",
  });
  if (!updated) return jsonError("Update failed", 500);

  if (isGoogleDriveConfigured()) {
    try {
      const { syncNarrationToDrive } = await import("@/lib/google-drive");
      await syncNarrationToDrive(updated);
    } catch (err) {
      console.error("[narrations PATCH] drive sync failed:", err);
      if (status === "submitted") {
        return NextResponse.json(
          {
            error:
              "Saved, but Google Drive sync failed. Please try again.",
            narration: getNarrationById(id),
          },
          { status: 502 }
        );
      }
    }
  }

  return NextResponse.json({ narration: getNarrationById(id) });
}
