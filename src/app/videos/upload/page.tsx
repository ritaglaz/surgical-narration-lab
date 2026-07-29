import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { UploadForm } from "@/components/UploadForm";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";

export default async function UploadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          Upload surgical video
        </h1>
        <p className="mt-2 text-slate-600">
          MP4 and WebM are recommended. After uploading, invite narrators from
          the Invite page so they receive a private link.
        </p>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
          <UploadForm />
        </div>
      </main>
    </div>
  );
}
