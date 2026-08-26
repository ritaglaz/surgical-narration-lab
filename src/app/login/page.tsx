import { Nav } from "@/components/Nav";
import { LoginForm } from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const params = await searchParams;

  return (
    <div className="min-h-screen">
      <Nav user={null} />
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-slate-900">
          Log in
        </h1>
        <p className="mt-2 text-slate-600">
          Access your video library and narrations.
        </p>
        <div className="mt-8 rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
          <LoginForm nextPath={params.next} />
        </div>
      </main>
    </div>
  );
}
