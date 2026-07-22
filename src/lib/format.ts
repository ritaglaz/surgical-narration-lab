export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso + (iso.endsWith("Z") || iso.includes("+") ? "" : "Z")).toLocaleDateString(
      undefined,
      { year: "numeric", month: "short", day: "numeric" }
    );
  } catch {
    return iso;
  }
}

export function extensionForMime(mime: string, fallback: string): string {
  const map: Record<string, string> = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/mp4": ".m4a",
  };
  return map[mime] || fallback;
}
