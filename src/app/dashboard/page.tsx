import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { DashboardClient } from "@/components/DashboardClient";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { getDistinctProcedureTypes, listVideos } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Admins share one library (all uploads). Narrators only see assigned videos.
  const videos = await listVideos({
    userId: user.id,
    assignedToUserId: isAdmin(user) ? undefined : user.id,
  });
  const procedures = await getDistinctProcedureTypes();

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <DashboardClient
          initialVideos={videos}
          procedures={procedures}
          user={user}
        />
      </main>
    </div>
  );
}
