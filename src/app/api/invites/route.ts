import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { getSessionUser, jsonError } from "@/lib/auth";
import { getAppBaseUrl, INVITE_EXPIRY_DAYS } from "@/lib/config";
import { createInvite, getVideoById, listInvites } from "@/lib/db";
import { isEmailConfigured, sendInviteEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);
  if (!isAdmin(user)) return jsonError("Admin access required", 403);
  return NextResponse.json({
    invites: listInvites(),
    emailConfigured: isEmailConfigured(),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return jsonError("Authentication required", 401);
  if (!isAdmin(user)) return jsonError("Admin access required", 403);

  let body: {
    email?: string;
    display_name?: string;
    video_ids?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const display_name = String(body.display_name || "").trim() || null;
  const video_ids = Array.isArray(body.video_ids)
    ? [...new Set(body.video_ids.map(String))]
    : [];

  if (!email || !email.includes("@")) {
    return jsonError("A valid email is required");
  }
  if (video_ids.length === 0) {
    return jsonError("Select at least one video to assign");
  }

  for (const id of video_ids) {
    if (!getVideoById(id)) {
      return jsonError(`Video not found: ${id}`, 404);
    }
  }

  const token = randomBytes(24).toString("hex");
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_EXPIRY_DAYS);

  const invite = createInvite({
    id: randomUUID(),
    email,
    display_name,
    token,
    invited_by: user.id,
    expires_at: expires.toISOString(),
    video_ids,
  });

  const origin = req.headers.get("origin") || undefined;
  const base = getAppBaseUrl(origin);
  const inviteUrl = `${base}/invite/${token}`;

  const emailResult = await sendInviteEmail({
    to: email,
    inviteUrl,
    inviterName: user.display_name,
    videoTitles: invite.video_titles,
    recipientName: display_name,
  });

  const { queueDatabaseSync } = await import("@/lib/google-drive");
  queueDatabaseSync();

  return NextResponse.json(
    {
      invite: {
        id: invite.id,
        email: invite.email,
        display_name: invite.display_name,
        expires_at: invite.expires_at,
        video_ids: invite.video_ids,
        video_titles: invite.video_titles,
      },
      inviteUrl,
      email: emailResult,
    },
    { status: 201 }
  );
}
