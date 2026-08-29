"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Keep in sync with server default in src/lib/config.ts (2 GB). */
const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB || 2048);

export function UploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [procedureType, setProcedureType] = useState("");
  const [description, setDescription] = useState("");
  const [caseId, setCaseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  function onFileChange(f: File | null) {
    setFile(f);
    setDuration(null);
    setError("");
    if (!f) return;

    const allowed = ["video/mp4", "video/webm", "video/quicktime"];
    const nameOk = /\.(mp4|webm|mov)$/i.test(f.name);
    if (!allowed.includes(f.type) && !nameOk) {
      setError("Unsupported format. Use MP4, WebM, or MOV.");
      setFile(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_MB} MB limit.`);
      setFile(null);
      return;
    }

    const url = URL.createObjectURL(f);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration);
      URL.revokeObjectURL(url);
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!file) {
      setError("Choose a video file to upload.");
      return;
    }
    setLoading(true);
    setError("");
    setProgress(0);

    try {
      const form = new FormData();
      form.append("title", title);
      form.append("procedure_type", procedureType);
      form.append("description", description);
      form.append("case_id", caseId);
      if (duration != null) form.append("duration", String(duration));
      form.append("file", file);

      const videoId = await uploadWithProgress(form, setProgress);
      router.push(`/videos/${videoId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Title</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 outline-none ring-teal-700/30 focus:ring-2"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">
          Procedure type
        </span>
        <input
          required
          placeholder="e.g. Laparoscopic cholecystectomy"
          value={procedureType}
          onChange={(e) => setProcedureType(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 outline-none ring-teal-700/30 focus:ring-2"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">
          Description (optional)
        </span>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 outline-none ring-teal-700/30 focus:ring-2"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">
          Case / study ID (optional)
        </span>
        <input
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 outline-none ring-teal-700/30 focus:ring-2"
        />
      </label>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Video file</span>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-white"
        />
        <p className="text-xs text-slate-500">
          MP4, WebM, or MOV — up to {MAX_MB} MB
          {file ? ` · selected ${(file.size / (1024 * 1024)).toFixed(1)} MB` : ""}
          {duration != null ? ` · ${Math.round(duration)}s` : ""}
        </p>
      </div>

      {loading && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-teal-700 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">Uploading… {progress}%</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-teal-800 px-5 py-2.5 font-medium text-white hover:bg-teal-900 disabled:opacity-60"
      >
        {loading ? "Uploading…" : "Upload video"}
      </button>
    </form>
  );
}

function uploadWithProgress(
  form: FormData,
  onProgress: (pct: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    // Let the browser set multipart boundary. Do not set Content-Type manually.
    xhr.withCredentials = true;
    xhr.timeout = 60 * 60 * 1000; // 60 minutes for large surgical videos
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data.video.id);
        } else {
          reject(new Error(data.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(
          new Error(
            `Upload failed (${xhr.status}). Server returned a non-JSON response.`
          )
        );
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Try a smaller file or a faster connection."));
    xhr.send(form);
  });
}
