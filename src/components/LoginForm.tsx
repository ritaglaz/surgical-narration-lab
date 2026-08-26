"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { safeNextPath } from "@/lib/safe-url";

export function LoginForm({ nextPath }: { nextPath?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.push(safeNextPath(nextPath));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-700/30 focus:ring-2"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-700/30 focus:ring-2"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-teal-800 px-4 py-2.5 font-medium text-white hover:bg-teal-900 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Log in"}
      </button>
      <p className="text-center text-sm text-slate-600">
        Need an account?{" "}
        <Link href="/signup" className="text-teal-800 underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
