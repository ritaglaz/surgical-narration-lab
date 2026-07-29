"use client";

import Link from "next/link";
import { useRef } from "react";
import { formatDuration } from "@/lib/format";
import type { Narration, Video } from "@/lib/types";

export function PlaybackClient({
  video,
  narration,
  narratorName,
}: {
  video: Video;
  narration: Narration;
  narratorName: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/dashboard" className="text-teal-800 hover:underline">
            Library
          </Link>{" "}
          /{" "}
          <Link
            href={`/videos/${video.id}`}
            className="text-teal-800 hover:underline"
          >
            {video.title}
          </Link>{" "}
          / Playback
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          Dictation playback
        </h1>
        <p className="text-slate-600">
          {narratorName} · {narration.status} ·{" "}
          {formatDuration(narration.recording_duration)}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-300 bg-black shadow-sm">
        <video
          src={`/api/media/video/${video.id}`}
          controls
          className="aspect-video w-full"
          playsInline
        />
      </div>

      {narration.audio_storage_path ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Post-video dictation — listen independently of the video.
          </p>
          <audio
            ref={audioRef}
            src={`/api/media/audio/${narration.id}`}
            controls
            className="w-full"
          />
        </div>
      ) : (
        <p className="text-sm text-slate-500">No audio file attached.</p>
      )}

      {narration.notes && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-slate-800">
            {narration.notes}
          </p>
        </div>
      )}
    </div>
  );
}
