/**
 * Application configuration.
 * Change APP_NAME here (or via NEXT_PUBLIC_APP_NAME) to rebrand.
 */

export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || "Surgical Narration";

export const APP_TAGLINE =
  process.env.NEXT_PUBLIC_APP_TAGLINE ||
  "Research platform for surgical video narration";

/** Max upload size for videos (bytes). Default 300 MB. */
export const MAX_VIDEO_BYTES = Number(
  process.env.MAX_VIDEO_BYTES || 300 * 1024 * 1024
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

/** Public base URL for invite links (no trailing slash). */
export function getAppBaseUrl(fallbackOrigin?: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, "");
  return "http://localhost:3000";
}

/** Invite links expire after this many days. */
export const INVITE_EXPIRY_DAYS = Number(process.env.INVITE_EXPIRY_DAYS || 30);

/**
 * Shown before/after the surgical video. Narrators record dictation against this brief.
 */
export const DICTATION_PROMPT =
  "You are about to view a 10-minute segment of a laparoscopic cholecystectomy surgical video. Please pay close attention and watch the video in its entirety. After viewing the surgical video, you will be prompted to record a narrative operative dictation. Record the dictation as if you have just completed the operation and are preparing the operative note for inclusion in the electronic medical record. You will also be asked what is the next step of the operation to be performed.";

/**
 * Comma-separated admin emails that always get full admin access.
 * Example: ritaglaz@buffalo.edu,pseger@buffalo.edu
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlistedAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}

/** True when additional authorized admins can still register. */
export function hasAllowlistedAdmins(): boolean {
  return getAdminEmails().length > 0;
}
