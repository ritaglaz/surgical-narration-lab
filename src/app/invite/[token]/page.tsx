import Link from "next/link";
import { Nav } from "@/components/Nav";
import { AcceptInviteForm } from "@/components/AcceptInviteForm";
import { APP_NAME } from "@/lib/config";
import { getInviteByToken } from "@/lib/db";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = getInviteByToken(token);

  return (
    <div className="min-h-screen">
      <Nav user={null} />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          Your videos — {APP_NAME}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          No account signup required. This link opens only the videos assigned
          to you.
        </p>
        {!invite ? (
          <div className="mt-6 space-y-3 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-900">
            <p>This invitation link is invalid.</p>
            <Link href="/" className="underline">
              Back to home
            </Link>
          </div>
        ) : new Date(invite.expires_at).getTime() < Date.now() &&
          !invite.accepted_at ? (
          <div className="mt-6 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <p>This invitation has expired. Ask the research team to send a new one.</p>
            <Link href="/" className="underline">
              Back to home
            </Link>
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
            <AcceptInviteForm
              token={token}
              email={invite.email}
              defaultName={invite.display_name || ""}
              videoTitles={invite.video_titles}
              inviterName={invite.invited_by_name}
            />
          </div>
        )}
      </main>
    </div>
  );
}
