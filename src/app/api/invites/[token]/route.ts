import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  acceptInvite,
  createSessionToken,
  jsonError,
  setSessionCookie,
} from "@/lib/auth";
import { getInviteByToken } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { ensurePersistenceRestored } = await import("@/lib/google-drive");
  await ensurePersistenceRestored();

  const { token } = await context.params;
  const invite = await getInviteByToken(token);
  if (!invite) return jsonError("Invitation not found", 404);

  const expired = new Date(invite.expires_at).getTime() < Date.now();
  return NextResponse.json({
    invite: {
      email: invite.email,
      display_name: invite.display_name,
      video_titles: invite.video_titles,
      invited_by_name: invite.invited_by_name,
      expires_at: invite.expires_at,
      accepted: Boolean(invite.accepted_at),
      expired,
    },
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  let body: { display_name?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return jsonError("Invalid JSON body");
  }

  try {
    const user = await acceptInvite({
      token,
      display_name: body.display_name,
    });
    const session = await createSessionToken(user);
    await setSessionCookie(session);
    const { queueDatabaseSync } = await import("@/lib/google-drive");
    queueDatabaseSync();
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonError(err.message, err.status);
    }
    throw err;
  }
}
