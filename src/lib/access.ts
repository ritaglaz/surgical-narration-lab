import { userHasVideoAccess } from "./db";
import { isAllowlistedAdminEmail } from "./config";
import type { SessionUser } from "./types";

/** True if DB role is admin or email is in ADMIN_EMAILS. */
export function isAdmin(user: SessionUser): boolean {
  return user.role === "admin" || isAllowlistedAdminEmail(user.email);
}

/** Admins can access all videos; narrators only assigned ones. */
export async function canAccessVideo(
  user: SessionUser,
  videoId: string
): Promise<boolean> {
  if (isAdmin(user)) return true;
  return userHasVideoAccess(user.id, videoId);
}

export function canUploadVideos(user: SessionUser): boolean {
  return isAdmin(user);
}
