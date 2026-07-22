/**
 * Application configuration.
 * Change APP_NAME here (or via NEXT_PUBLIC_APP_NAME) to rebrand.
 */

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "Surgical Narration Lab";

export const APP_TAGLINE =
  process.env.NEXT_PUBLIC_APP_TAGLINE ||
  "Research platform for surgical video narration";

/** Max upload size for videos (bytes). Default 500 MB. */
export const MAX_VIDEO_BYTES = Number(
  process.env.MAX_VIDEO_BYTES || 500 * 1024 * 1024
);

/** Max upload size for audio narrations (bytes). Default 100 MB. */
export const MAX_AUDIO_BYTES = Number(
  process.env.MAX_AUDIO_BYTES || 100 * 1024 * 1024
);

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"] as const;

export const SESSION_COOKIE = "snl_session";

export const SESSION_DAYS = 14;

/** When true (default for local MVP), use SQLite + local disk storage. */
export function isLocalMode(): boolean {
  if (process.env.STORAGE_BACKEND === "local") return true;
  if (process.env.STORAGE_BACKEND === "supabase") return false;
  // Auto: local unless Supabase URL is configured
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getDataDir(): string {
  return process.env.DATA_DIR || "./data";
}
