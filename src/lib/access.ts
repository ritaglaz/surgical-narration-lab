import { userHasVideoAccess } from "./db";
import type { SessionUser } from "./types";

export function isAdmin(user: SessionUser): boolean {
  return user.role === "admin";
}

/** Admins can access all videos; narrators only assigned ones. */
export function canAccessVideo(user: SessionUser, videoId: string): boolean {
  if (isAdmin(user)) return true;
  return userHasVideoAccess(user.id, videoId);
}

export function canUploadVideos(user: SessionUser): boolean {
  return isAdmin(user);
}
