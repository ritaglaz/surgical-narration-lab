import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { DashboardClient } from "@/components/DashboardClient";
import { PrivacyNotice } from "@/components/PrivacyNotice";
import { getSessionUser } from "@/lib/auth";
import { getDistinctProcedureTypes, listVideos } from "@/lib/db";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const videos = listVideos({ userId: user.id });
  const procedures = getDistinctProcedureTypes();

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <PrivacyNotice compact />
        <DashboardClient initialVideos={videos} procedures={procedures} />
      </main>
    </div>
  );
}
