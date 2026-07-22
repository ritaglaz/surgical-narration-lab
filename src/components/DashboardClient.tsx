"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate, formatDuration } from "@/lib/format";
import type { VideoWithStats } from "@/lib/types";

export function DashboardClient({
  initialVideos,
  procedures,
}: {
  initialVideos: VideoWithStats[];
  procedures: string[];
}) {
  const [q, setQ] = useState("");
  const [procedure, setProcedure] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    return initialVideos.filter((v) => {
      if (procedure !== "all" && v.procedure_type !== procedure) return false;
      if (status !== "all" && v.narration_status !== status) return false;
      if (q.trim()) {
        const hay = `${v.title} ${v.procedure_type} ${v.case_id || ""}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [initialVideos, q, procedure, status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
            Video library
          </h1>
          <p className="mt-1 text-slate-600">
            Open a case to narrate, or upload a new surgical video.
          </p>
        </div>
        <Link
          href="/videos/upload"
          className="inline-flex items-center justify-center rounded-md bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900"
        >
          Upload video
        </Link>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white/70 p-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title, procedure, case ID"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-700/30 focus:ring-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Procedure</span>
          <select
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-700/30 focus:ring-2"
          >
            <option value="all">All</option>
            {procedures.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Your narration status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-700/30 focus:ring-2"
          >
            <option value="all">All</option>
            <option value="not_started">Not started</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/50 px-6 py-12 text-center text-slate-600">
          No videos match these filters.{" "}
          <Link href="/videos/upload" className="text-teal-800 underline">
            Upload one
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Procedure</th>
                <th className="px-4 py-3 font-medium">Uploaded</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Recordings</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {v.title}
                    {v.case_id ? (
                      <div className="text-xs font-normal text-slate-500">
                        Case {v.case_id}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{v.procedure_type}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(v.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDuration(v.duration)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.narration_status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{v.narration_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/videos/${v.id}`}
                      className="inline-flex rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                    >
                      {v.narration_status === "not_started"
                        ? "Start narrating"
                        : "Continue"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "not_started" | "draft" | "submitted";
}) {
  const styles = {
    not_started: "bg-slate-100 text-slate-700",
    draft: "bg-amber-100 text-amber-900",
    submitted: "bg-teal-100 text-teal-900",
  };
  const labels = {
    not_started: "Not started",
    draft: "Draft",
    submitted: "Submitted",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
