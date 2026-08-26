import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { InviteAdminClient } from "@/components/InviteAdminClient";
import { isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { listInvites, listVideos } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";
import { toPublicInvite } from "@/lib/types";

export default async function AdminInvitesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/dashboard");

  // Shared library: all videos available for narrator invites.
  const videos = listVideos({ userId: user.id });
  const invites = listInvites().map(toPublicInvite);

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <InviteAdminClient
          videos={videos}
          initialInvites={invites}
          emailConfigured={isEmailConfigured()}
        />
      </main>
    </div>
  );
}
