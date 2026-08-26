/**
 * Safe internal redirect target (relative path only).
 * Rejects protocol-relative and absolute URLs.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("://")
  ) {
    return "/dashboard";
  }
  return raw;
}
