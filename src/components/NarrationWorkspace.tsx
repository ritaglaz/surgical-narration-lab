"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { Narration, NarrationMode, Video } from "@/lib/types";

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

  const [mode, setMode] = useState<NarrationMode>("synchronized");
  const [micStatus, setMicStatus] = useState<
    "unknown" | "granted" | "denied" | "checking"
  >("unknown");
  const [recState, setRecState] = useState<RecState>("idle");
  const [countdown, setCountdown] = useState(0);
  const [recSeconds, setRecSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoStartTimestamp, setVideoStartTimestamp] = useState(0);
  const [notes, setNotes] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [narrations, setNarrations] = useState(initialNarrations);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncPlay, setSyncPlay] = useState(false);

  const videoSrc = `/api/media/video/${video.id}`;

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

  async function checkMic() {
    setMicStatus("checking");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
      setError("Microphone permission denied. Enable it in browser settings.");
    }
  }

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
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
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

    const v = videoRef.current;
    if (mode === "synchronized" && v) {
      setVideoStartTimestamp(v.currentTime);
      v.muted = true;
      v.play().catch(() => undefined);
    } else {
      setVideoStartTimestamp(0);
    }

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
      setError("Could not access microphone.");
      setRecState("idle");
    }
  }

  function pauseRecording() {
    const r = mediaRecorderRef.current;
    if (r && r.state === "recording") {
      r.pause();
      videoRef.current?.pause();
      setRecState("paused");
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  }

  function resumeRecording() {
    const r = mediaRecorderRef.current;
    if (r && r.state === "paused") {
      r.resume();
      if (mode === "synchronized") videoRef.current?.play().catch(() => undefined);
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
      videoRef.current?.pause();
    }
  }

  function restartRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
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
    setSyncPlay(false);
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.currentTime = 0;
    }
  }

  async function save(status: "draft" | "submitted") {
    if (!blob && !editingId) {
      setError("Record audio before saving.");
      return;
    }
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("video_id", video.id);
      form.append("narration_mode", mode);
      form.append("status", status);
      form.append("notes", notes);
      form.append("video_start_timestamp", String(videoStartTimestamp));
      form.append("recording_duration", String(recSeconds));
      if (editingId) form.append("narration_id", editingId);
      if (blob) {
        form.append("file", blob, `narration.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
      }

      const res = await fetch("/api/narrations", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      setEditingId(data.narration.id);
      setMessage(
        status === "submitted"
          ? "Recording submitted."
          : "Draft saved. You can return later to continue."
      );

      const refresh = await fetch(`/api/videos/${video.id}`);
      const refreshed = await refresh.json();
      if (refresh.ok) setNarrations(refreshed.narrations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function playSynchronized() {
    const v = videoRef.current;
    const a = audioPreviewRef.current;
    if (!v || !a || !previewUrl) return;
    v.muted = true;
    v.currentTime = videoStartTimestamp;
    a.currentTime = 0;
    setSyncPlay(true);
    Promise.all([v.play(), a.play()]).catch(() => undefined);
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/dashboard" className="text-teal-800 hover:underline">
              Library
            </Link>{" "}
            / Narration workspace
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
            {video.title}
          </h1>
          <p className="text-slate-600">
            {video.procedure_type}
            {video.case_id ? ` · Case ${video.case_id}` : ""}
          </p>
        </div>
        <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-950">
          Mode:{" "}
          <strong>
            {mode === "synchronized"
              ? "Synchronized voiceover"
              : "Post-video dictation"}
          </strong>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-950 shadow-sm">
            <video
              ref={videoRef}
              src={videoSrc}
              className="aspect-video w-full bg-black"
              onTimeUpdate={() =>
                setCurrentTime(videoRef.current?.currentTime || 0)
              }
              onLoadedMetadata={onLoadedMetadata}
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
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Narration mode
            </h2>
            <div className="grid gap-2">
              <ModeButton
                active={mode === "synchronized"}
                disabled={recState !== "idle" && recState !== "preview"}
                title="Synchronized voiceover"
                description="Record while the video plays. Timing is stored for aligned playback."
                onClick={() => setMode("synchronized")}
              />
              <ModeButton
                active={mode === "dictation"}
                disabled={recState !== "idle" && recState !== "preview"}
                title="Post-video dictation"
                description="Watch first, then record a separate summary. No sync required."
                onClick={() => setMode("dictation")}
              />
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Microphone
              </h2>
              <button
                type="button"
                onClick={checkMic}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
              >
                Check permission
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Status:{" "}
              <span className="font-medium">
                {micStatus === "granted"
                  ? "Ready"
                  : micStatus === "denied"
                    ? "Denied"
                    : micStatus === "checking"
                      ? "Checking…"
                      : "Not checked"}
              </span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-teal-600 transition-[width] duration-75"
                style={{ width: `${level}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">Microphone activity</p>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
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
                <span className="tabular-nums">{formatDuration(recSeconds)}</span>
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
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Preview
              </h2>
              <audio ref={audioPreviewRef} src={previewUrl} controls className="w-full" />
              {mode === "synchronized" && (
                <button
                  type="button"
                  onClick={playSynchronized}
                  className="rounded-md border border-teal-700 px-3 py-2 text-sm text-teal-900 hover:bg-teal-50"
                >
                  Play video + narration together
                </button>
              )}
              {syncPlay && (
                <p className="text-xs text-slate-500">
                  Video muted; narration starts at video t=
                  {videoStartTimestamp.toFixed(1)}s
                </p>
              )}
            </div>
          )}

          <label className="block space-y-1.5 border-t border-slate-100 pt-4">
            <span className="text-sm font-medium text-slate-700">
              Notes (optional)
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-700/30 focus:ring-2"
            />
          </label>

          <div className="flex flex-wrap gap-2">
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
              disabled={saving || (!blob && !editingId)}
              onClick={() => save("submitted")}
              className="rounded-md bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Submit recording"}
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-slate-900">
          Saved narrations
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Multiple narrators can record the same case. Open a saved recording to
          replay it.
        </p>
        {narrations.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No narrations yet.</p>
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
                      ({n.status} · {n.narration_mode})
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {formatDuration(n.recording_duration)}
                    {n.narration_mode === "synchronized"
                      ? ` · starts at ${formatDuration(n.video_start_timestamp)}`
                      : ""}
                    {n.user_id === currentUserId ? " · yours" : ""}
                  </div>
                </div>
                <Link
                  href={`/videos/${video.id}/playback/${n.id}`}
                  className="inline-flex rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                >
                  Open playback
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  title,
  description,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-left transition ${
        active
          ? "border-teal-700 bg-teal-50"
          : "border-slate-200 hover:border-slate-300"
      } disabled:opacity-50`}
    >
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-600">{description}</div>
    </button>
  );
}
