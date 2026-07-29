"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInviteForm({
  token,
  email,
  defaultName,
  videoTitles,
  inviterName,
}: {
  token: string;
  email: string;
  defaultName: string;
  videoTitles: string[];
  inviterName?: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(defaultName);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoTried, setAutoTried] = useState(false);

  async function openAccess(name?: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/invites/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name || displayName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open invite");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open invite");
      setLoading(false);
    }
  }

  // One-click: open assigned videos as soon as the invite link loads.
  useEffect(() => {
    if (autoTried) return;
    setAutoTried(true);
    void openAccess(defaultName || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTried]);

  return (
    <div className="space-y-4">
      {inviterName && (
        <p className="text-sm text-slate-600">
          Invited by <span className="font-medium">{inviterName}</span>
        </p>
      )}
      {videoTitles.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Videos for you</p>
          <ul className="mt-1 list-inside list-disc">
            {videoTitles.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {loading && !error ? (
        <p className="text-sm text-slate-600">Opening your assigned videos…</p>
      ) : null}

      {error && (
        <div className="space-y-3">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
          <p className="text-sm text-slate-600">
            Access for <span className="font-medium">{email}</span> — no account
            signup required.
          </p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Name (optional)
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-700/30 focus:ring-2"
              placeholder="How you should appear on recordings"
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => openAccess()}
            className="w-full rounded-md bg-teal-800 px-4 py-2.5 font-medium text-white hover:bg-teal-900 disabled:opacity-60"
          >
            {loading ? "Opening…" : "Open my videos"}
          </button>
        </div>
      )}
    </div>
  );
}
