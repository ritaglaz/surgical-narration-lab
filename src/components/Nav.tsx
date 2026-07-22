"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import type { SessionUser } from "@/lib/types";

export function Nav({ user }: { user: SessionUser | null }) {
  return (
    <header className="border-b border-slate-200 bg-[#f7f5f1]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={user ? "/dashboard" : "/"} className="group">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-teal-800/80">
            Research tools
          </div>
          <div className="font-[family-name:var(--font-display)] text-xl text-slate-900 group-hover:text-teal-900 sm:text-2xl">
            {APP_NAME}
          </div>
        </Link>
        <nav className="flex items-center gap-2 text-sm sm:gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-200/60"
              >
                Library
              </Link>
              <Link
                href="/videos/upload"
                className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-200/60"
              >
                Upload
              </Link>
              <span className="hidden text-slate-500 sm:inline">
                {user.display_name}
              </span>
              <button
                type="button"
                className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-200/60"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-200/60"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-teal-800 px-3 py-2 text-white hover:bg-teal-900"
              >
                Create account
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
