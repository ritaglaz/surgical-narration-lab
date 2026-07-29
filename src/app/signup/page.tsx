import { Nav } from "@/components/Nav";
import { SignupForm } from "@/components/SignupForm";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { getSessionUser } from "@/lib/auth";
import { canBootstrapAdmin } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  if (!canBootstrapAdmin()) {
    return (
      <div className="min-h-screen">
        <Nav user={null} />
        <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
            Admin already set up
          </h1>
          <p className="mt-3 text-slate-600">
            Narrators do not create accounts. Open the invitation link emailed
            (or copied) by an admin to access your assigned videos.
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Admins:{" "}
            <Link href="/login" className="text-teal-800 underline">
              Log in
            </Link>
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Nav user={null} />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          First-time admin setup
        </h1>
        <p className="mt-2 text-slate-600">
          Create the admin account that uploads videos and invites narrators.
        </p>
        <div className="mt-6">
          <PrivacyNotice compact />
        </div>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
          <SignupForm />
        </div>
      </main>
    </div>
  );
}
