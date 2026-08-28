import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PlaybackClient } from "@/components/PlaybackClient";
import { canAccessVideo, isAdmin } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { getNarrationById, getProfileById, getVideoById } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PlaybackPage({
  params,
}: {
  params: Promise<{ id: string; narrationId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id, narrationId } = await params;
  const video = await getVideoById(id);
  const narration = await getNarrationById(narrationId);
  if (!video || !narration || narration.video_id !== video.id) notFound();
  if (!(await canAccessVideo(user, id))) redirect("/dashboard");
  if (!isAdmin(user) && narration.user_id !== user.id) {
    redirect(`/videos/${id}`);
  }

  const narrator = await getProfileById(narration.user_id);

  return (
    <div className="min-h-screen">
      <Nav user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PlaybackClient
          video={video}
          narration={narration}
          narratorName={narrator?.display_name || "Unknown"}
        />
      </main>
    </div>
  );
}
