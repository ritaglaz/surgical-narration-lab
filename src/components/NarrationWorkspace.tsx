"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DICTATION_PROMPT } from "@/lib/config";
import { formatDuration } from "@/lib/format";
import type { Narration, Video } from "@/lib/types";

type ListedNarration = Narration & {
  narrator_name: string;
  narrator_email: string;
};

type RecState = "idle" | "countdown" | "recording" | "paused" | "preview";

export function NarrationWorkspace({
  video,
  narrations: initialNarrations,
  currentUserId,
}: {
  video: Video;
  narrations: ListedNarration[];
  currentUserId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const [showDictation, setShowDictation] = useState(false);
  const [watchedOnce, setWatchedOnce] = useState(false);
  const [micStatus, setMicStatus] = useState<
    "unknown" | "granted" | "denied" | "checking"
  >("unknown");
  const [recState, setRecState] = useState<RecState>("idle");
  const [countdown, setCountdown] = useState(0);
  const [recSeconds, setRecSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nextStep, setNextStep] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [narrations, setNarrations] = useState(initialNarrations);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState("");

  const videoSrc = `/api/media/video/${video.id}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(videoSrc, {
          headers: { Range: "bytes=0-0" },
          credentials: "same-origin",
        });
        if (cancelled) return;
        if (res.status === 404) {
          const data = await res.json().catch(() => null);
          setVideoError(
            (data && data.error) ||
              "Video file is missing from the server. An admin must re-upload this video."
          );
        } else if (!res.ok && res.status !== 206 && res.status !== 200) {
          setVideoError(
            `Video could not be loaded (HTTP ${res.status}). Try refreshing, or ask an admin to re-upload.`
          );
        }
      } catch {
        // Network errors are handled by the video element onError as well.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoSrc]);

  useEffect(() => {
    return () => {
      stopMeters();
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (countdownRef.current) window.clearInterval(countdownRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMeters = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevel(0);
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const startLevelMeter = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setLevel(Math.min(100, Math.round((avg / 128) * 100)));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  async function prepareStream() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    setMicStatus("granted");
    startLevelMeter(stream);
    return stream;
  }

  function pickMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
    ];
    for (const c of candidates) {
      if (
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(c)
      ) {
        return c;
      }
    }
    return "";
  }

  function beginRecording(stream: MediaStream) {
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    );
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "audio/webm";
      const b = new Blob(chunksRef.current, { type });
      setBlob(b);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(b);
      setPreviewUrl(url);
      setRecState("preview");
      stopMeters();
      stopStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };

    recorder.start(250);
    setRecState("recording");
    setRecSeconds(0);
    timerRef.current = window.setInterval(() => {
      setRecSeconds((s) => s + 1);
    }, 1000);
  }

  async function startWithCountdown() {
    setError("");
    setMessage("");
    try {
      const stream = await prepareStream();
      setRecState("countdown");
      setCountdown(3);
      let n = 3;
      countdownRef.current = window.setInterval(() => {
        n -= 1;
        setCountdown(n);
        if (n <= 0) {
          if (countdownRef.current) window.clearInterval(countdownRef.current);
          beginRecording(stream);
        }
      }, 1000);
    } catch {
      setMicStatus("denied");
      setError("Could not access microphone. Allow mic permission and try again.");
      setRecState("idle");
    }
  }

  function pauseRecording() {
    const r = mediaRecorderRef.current;
    if (r && r.state === "recording") {
      r.pause();
      setRecState("paused");
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  }

  function resumeRecording() {
    const r = mediaRecorderRef.current;
    if (r && r.state === "paused") {
      r.resume();
      setRecState("recording");
      timerRef.current = window.setInterval(() => {
        setRecSeconds((s) => s + 1);
      }, 1000);
    }
  }

  function stopRecording() {
    const r = mediaRecorderRef.current;
    if (r && (r.state === "recording" || r.state === "paused")) {
      r.stop();
    }
  }

  function restartRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopMeters();
    stopStream();
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setRecSeconds(0);
    setRecState("idle");
  }

  function openDictationPopup() {
    setWatchedOnce(true);
    setShowDictation(true);
    setError("");
    setMessage("");
  }

  function onVideoEnded() {
    openDictationPopup();
  }

  async function save(status: "draft" | "submitted") {
    if (!blob && !editingId) {
      setError("Record audio before saving.");
      return;
    }
    if (status === "submitted" && !nextStep.trim()) {
      setError(
        "Please describe the next step of the operation before submitting."
      );
      return;
    }
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("video_id", video.id);
      form.append("narration_mode", "dictation");
      form.append("status", status);
      form.append("next_step", nextStep.trim());
      form.append("video_start_timestamp", "0");
      form.append("recording_duration", String(recSeconds));
      if (editingId) form.append("narration_id", editingId);
      if (blob) {
        form.append(
          "file",
          blob,
          `narration.${blob.type.includes("mp4") ? "m4a" : "webm"}`
        );
      }

      const res = await fetch("/api/narrations", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      setEditingId(data.narration.id);
      if (data.narration.next_step) setNextStep(data.narration.next_step);
      const driveStatus = data.narration.drive_sync_status;
      if (status === "submitted") {
        setMessage(
          driveStatus === "failed"
            ? "Saved, but Drive sync failed — please submit again."
            : driveStatus === "synced" || driveStatus === "not_required"
              ? "Dictation submitted and saved. Thank you."
              : "Dictation submitted. Thank you."
        );
      } else {
        setMessage("Draft saved. You can return later to continue.");
      }

      const refresh = await fetch(`/api/videos/${video.id}`);
      const refreshed = await refresh.json();
      if (refresh.ok) setNarrations(refreshed.narrations);

      if (status === "submitted") {
        setTimeout(() => setShowDictation(false), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    if (!video.duration && Number.isFinite(v.duration)) {
      await fetch(`/api/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: v.duration }),
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/dashboard" className="text-teal-800 hover:underline">
            Library
          </Link>{" "}
          / Case
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          {video.title}
        </h1>
        <p className="text-slate-600">
          {video.procedure_type}
          {video.case_id ? ` · Case ${video.case_id}` : ""}
        </p>
      </div>

      <aside className="rounded-lg border border-slate-200 bg-white/80 px-4 py-4 text-sm leading-relaxed text-slate-700 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Instructions
        </h2>
        <p className="mt-2 whitespace-pre-wrap">{DICTATION_PROMPT}</p>
      </aside>

      {videoError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {videoError}{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={openDictationPopup}
          >
            Open dictation anyway
          </button>
        </div>
      )}
      {error && !showDictation && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && !showDictation && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {message}
        </div>
      )}

      <section className="space-y-3">
        <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-950 shadow-sm">
          <video
            ref={videoRef}
            src={videoSrc}
            className="aspect-video w-full bg-black"
            onTimeUpdate={() =>
              setCurrentTime(videoRef.current?.currentTime || 0)
            }
            onLoadedMetadata={() => {
              setVideoError("");
              void onLoadedMetadata();
            }}
            onError={() =>
              setVideoError((prev) =>
                prev
                  ? prev
                  : "This video file could not be played. If it disappeared after a server restart, ask an admin to re-upload it (new uploads are backed up to Google Drive)."
              )
            }
            onEnded={onVideoEnded}
            playsInline
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <button
            type="button"
            className="rounded-md bg-slate-800 px-3 py-2 text-white"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) v.play();
              else v.pause();
            }}
          >
            Play / Pause
          </button>
          <label className="flex items-center gap-2">
            Seek
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = t;
                setCurrentTime(t);
              }}
              className="w-32"
            />
          </label>
          <span className="tabular-nums text-slate-700">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
          <label className="flex items-center gap-2">
            Vol
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const val = Number(e.target.value);
                setVolume(val);
                if (videoRef.current) videoRef.current.volume = val;
              }}
              className="w-20"
            />
          </label>
          <label className="flex items-center gap-2">
            Speed
            <select
              value={playbackRate}
              onChange={(e) => {
                const r = Number(e.target.value);
                setPlaybackRate(r);
                if (videoRef.current) videoRef.current.playbackRate = r;
              }}
              className="rounded border border-slate-300 px-2 py-1"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={openDictationPopup}
            className="rounded-md bg-teal-800 px-3 py-2 text-white hover:bg-teal-900"
          >
            {watchedOnce ? "Open dictation" : "Skip to dictation"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-slate-900">
          Your saved dictations
        </h2>
        {narrations.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            None yet — finish the video to record.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {narrations.map((n) => (
              <li
                key={n.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {n.narrator_name}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      ({n.status})
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {formatDuration(n.recording_duration)}
                    {n.user_id === currentUserId ? " · yours" : ""}
                  </div>
                </div>
                <Link
                  href={`/videos/${video.id}/playback/${n.id}`}
                  className="inline-flex rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900"
                >
                  Open playback
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showDictation && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dictation-title"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="dictation-title"
                  className="font-[family-name:var(--font-display)] text-2xl text-slate-900"
                >
                  Operative dictation
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Record as if you just completed the operation and are writing
                  the operative note for the medical record.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  if (recState === "recording" || recState === "paused") {
                    stopRecording();
                  }
                  setShowDictation(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700">
              {DICTATION_PROMPT}
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
            {message && (
              <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                {message}
              </div>
            )}

            <div className="mt-4 space-y-2">
              <p className="text-sm text-slate-600">
                Microphone:{" "}
                <span className="font-medium">
                  {micStatus === "granted"
                    ? "Ready"
                    : micStatus === "denied"
                      ? "Denied"
                      : micStatus === "checking"
                        ? "Checking…"
                        : "Will request when you start"}
                </span>
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-teal-600 transition-[width] duration-75"
                  style={{ width: `${level}%` }}
                />
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {recState === "countdown" && (
                <div className="rounded-md bg-slate-900 px-4 py-6 text-center text-4xl font-semibold text-white">
                  {countdown}
                </div>
              )}
              {(recState === "recording" || recState === "paused") && (
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-900">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                    {recState === "paused" ? "Paused" : "Recording"}
                  </span>
                  <span className="tabular-nums">
                    {formatDuration(recSeconds)}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(recState === "idle" || recState === "preview") && (
                  <button
                    type="button"
                    onClick={startWithCountdown}
                    className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
                  >
                    {recState === "preview" ? "Re-record" : "Start recording"}
                  </button>
                )}
                {recState === "recording" && (
                  <>
                    <button
                      type="button"
                      onClick={pauseRecording}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white"
                    >
                      Stop
                    </button>
                  </>
                )}
                {recState === "paused" && (
                  <>
                    <button
                      type="button"
                      onClick={resumeRecording}
                      className="rounded-md bg-teal-800 px-3 py-2 text-sm text-white"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white"
                    >
                      Stop
                    </button>
                  </>
                )}
                {recState !== "idle" && (
                  <button
                    type="button"
                    onClick={restartRecording}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    Restart
                  </button>
                )}
              </div>
            </div>

            {previewUrl && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Preview
                </h3>
                <audio
                  ref={audioPreviewRef}
                  src={previewUrl}
                  controls
                  className="w-full"
                />
              </div>
            )}

            <label className="mt-4 block space-y-1.5 border-t border-slate-100 pt-4">
              <span className="text-sm font-medium text-slate-700">
                What is the next step of the operation to be performed?
              </span>
              <textarea
                rows={4}
                required
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="Describe the next operative step…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-700/30 focus:ring-2"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || (!blob && !editingId)}
                onClick={() => save("draft")}
                className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                disabled={saving || (!blob && !editingId) || !nextStep.trim()}
                onClick={() => save("submitted")}
                className="rounded-md bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Submit dictation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
