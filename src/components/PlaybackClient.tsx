"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [synced, setSynced] = useState(false);

  const isSync = narration.narration_mode === "synchronized";

  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || !isSync) return;

    const onPlay = () => {
      if (!synced) return;
      a.currentTime = Math.max(0, v.currentTime - narration.video_start_timestamp);
      if (a.paused) a.play().catch(() => undefined);
    };
    const onPause = () => a.pause();
    const onSeeking = () => {
      if (!synced) return;
      a.currentTime = Math.max(0, v.currentTime - narration.video_start_timestamp);
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", onSeeking);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", onSeeking);
    };
  }, [isSync, synced, narration.video_start_timestamp]);

  function startSynced() {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a) return;
    setSynced(true);
    v.muted = true;
    v.currentTime = narration.video_start_timestamp || 0;
    a.currentTime = 0;
    Promise.all([v.play(), a.play()]).catch(() => undefined);
  }

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
          Narration playback
        </h1>
        <p className="text-slate-600">
          {narratorName} · {narration.narration_mode} · {narration.status} ·{" "}
          {formatDuration(narration.recording_duration)}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-300 bg-black shadow-sm">
        <video
          ref={videoRef}
          src={`/api/media/video/${video.id}`}
          controls={!isSync || !synced}
          className="aspect-video w-full"
          playsInline
        />
      </div>

      {narration.audio_storage_path ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          {isSync ? (
            <>
              <p className="text-sm text-slate-600">
                Synchronized narration begins at video time{" "}
                {formatDuration(narration.video_start_timestamp)}. Use the
                button below to watch the video while hearing the narration.
              </p>
              <button
                type="button"
                onClick={startSynced}
                className="rounded-md bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900"
              >
                Play synchronized video + narration
              </button>
              <audio
                ref={audioRef}
                src={`/api/media/audio/${narration.id}`}
                className="hidden"
              />
              {synced && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    onClick={() => {
                      videoRef.current?.pause();
                      audioRef.current?.pause();
                    }}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    onClick={() => {
                      videoRef.current?.play();
                      audioRef.current?.play();
                    }}
                  >
                    Resume
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Post-video dictation — audio is independent of video timing.
              </p>
              <audio
                ref={audioRef}
                src={`/api/media/audio/${narration.id}`}
                controls
                className="w-full"
              />
            </>
          )}
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
