import { Nav } from "@/components/Nav";
import { SignupForm } from "@/components/SignupForm";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <Nav user={null} />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          Create account
        </h1>
        <p className="mt-2 text-slate-600">
          The first account on a fresh install becomes an admin.
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
