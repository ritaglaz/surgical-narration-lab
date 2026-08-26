"use client";

import { useMemo, useState } from "react";
import type { InvitePublic, VideoWithStats } from "@/lib/types";

export function InviteAdminClient({
  videos,
  initialInvites,
  emailConfigured,
}: {
  videos: VideoWithStats[];
  initialInvites: InvitePublic[];
  emailConfigured: boolean;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [invites, setInvites] = useState(initialInvites);
  const [lastLink, setLastLink] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedTitles = useMemo(
    () =>
      videos
        .filter((v) => selected.includes(v.id))
        .map((v) => v.title)
        .join(", "),
    [videos, selected]
  );

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEmailNote("");
    setLastLink("");
    setLoading(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          display_name: displayName || undefined,
          video_ids: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invite");

      setLastLink(data.inviteUrl);
      if (data.email?.sent) {
        setEmailNote(`Email sent to ${email}.`);
      } else {
        setEmailNote(
          data.email?.reason ||
            "Email was not sent. Copy the invite link below and share it manually."
        );
      }

      const listRes = await fetch("/api/invites");
      if (listRes.ok) {
        const listData = await listRes.json();
        setInvites(listData.invites || []);
      }

      setEmail("");
      setDisplayName("");
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          Invite narrators
        </h1>
        <p className="mt-2 text-slate-600">
          Choose videos, enter an email, and send a private link. That person
          will only see the videos you assign.
        </p>
        {!emailConfigured && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Email sending is not configured yet (
            <code className="text-xs">RESEND_API_KEY</code> +{" "}
            <code className="text-xs">EMAIL_FROM</code>). You can still create
            invites and copy the link.
          </p>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm"
      >
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-700/30 focus:ring-2"
              placeholder="colleague@hospital.edu"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">
              Display name (optional)
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none ring-teal-700/30 focus:ring-2"
              placeholder="Dr. Smith"
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            Videos to assign
          </legend>
          {videos.length === 0 ? (
            <p className="text-sm text-slate-500">
              Upload videos first, then invite narrators.
            </p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
              {videos.map((v) => (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(v.id)}
                    onChange={() => toggle(v.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      {v.title}
                    </span>
                    <span className="text-xs text-slate-500">
                      {v.procedure_type}
                      {v.case_id ? ` · Case ${v.case_id}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {selected.length > 0 && (
            <p className="text-xs text-slate-500">Selected: {selectedTitles}</p>
          )}
        </fieldset>

        <button
          type="submit"
          disabled={loading || selected.length === 0}
          className="rounded-md bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
        >
          {loading
            ? "Creating invite…"
            : emailConfigured
              ? "Send invite email"
              : "Create invite link"}
        </button>
      </form>

      {(lastLink || emailNote) && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-4 text-sm text-teal-950">
          {emailNote && <p className="mb-2">{emailNote}</p>}
          {lastLink && (
            <div className="space-y-2">
              <p className="font-medium">Invite link</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={lastLink}
                  className="w-full rounded-md border border-teal-300 bg-white px-3 py-2 text-xs sm:text-sm"
                />
                <button
                  type="button"
                  className="rounded-md bg-teal-800 px-3 py-2 text-white hover:bg-teal-900"
                  onClick={() => navigator.clipboard.writeText(lastLink)}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-slate-900">Recent invites</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-slate-500">No invites yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Videos</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const expired =
                    !inv.accepted_at &&
                    new Date(inv.expires_at).getTime() < Date.now();
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {inv.email}
                        </div>
                        {inv.display_name && (
                          <div className="text-xs text-slate-500">
                            {inv.display_name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {inv.video_titles.join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {inv.accepted_at
                          ? "Accepted"
                          : expired
                            ? "Expired"
                            : "Pending"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(inv.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
