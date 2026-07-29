import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <Nav user={null} />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-800">
            Academic research MVP
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight text-slate-900 sm:text-5xl">
            {APP_NAME}
          </h1>
          <p className="max-w-xl text-lg text-slate-700">{APP_TAGLINE}</p>
          <p className="max-w-xl text-slate-600">
            Admins upload surgical videos and invite narrators by email. Invitees
            only see their assigned cases, record voiceovers, and submissions
            sync to Google Drive with narrator identity.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-md bg-teal-800 px-5 py-2.5 font-medium text-white hover:bg-teal-900"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-md border border-slate-300 bg-white/70 px-5 py-2.5 font-medium text-slate-800 hover:bg-white"
            >
              Admin setup
            </Link>
          </div>
        </section>
        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 text-sm text-slate-700 shadow-sm">
          <ol className="list-decimal space-y-2 pl-4">
            <li>Admin uploads a video with case metadata.</li>
            <li>Admin invites a narrator and assigns specific videos.</li>
            <li>Invitee opens the link, watches the video, then dictation pops up.</li>
            <li>Audio + JSON (with user info) sync to Google Drive.</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
