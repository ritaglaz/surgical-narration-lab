import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { NarrationWorkspace } from "@/components/NarrationWorkspace";
import { canAccessVideo } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { getVideoById, listNarrationsForVideo } from "@/lib/db";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const video = getVideoById(id);
  if (!video) notFound();
  if (!canAccessVideo(user, id)) redirect("/dashboard");

  const allNarrations = listNarrationsForVideo(id);
  const narrations =
    user.role === "admin"
      ? allNarrations
      : allNarrations.filter((n) => n.user_id === user.id);

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <NarrationWorkspace
          video={video}
          narrations={narrations}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}
