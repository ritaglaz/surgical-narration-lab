import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PlaybackClient } from "@/components/PlaybackClient";
import { canAccessVideo } from "@/lib/access";
import { getSessionUser } from "@/lib/auth";
import { getNarrationById, getProfileById, getVideoById } from "@/lib/db";

export default async function PlaybackPage({
  params,
}: {
  params: Promise<{ id: string; narrationId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id, narrationId } = await params;
  const video = getVideoById(id);
  const narration = getNarrationById(narrationId);
  if (!video || !narration || narration.video_id !== video.id) notFound();
  if (!canAccessVideo(user, id)) redirect("/dashboard");
  if (user.role !== "admin" && narration.user_id !== user.id) {
    redirect(`/videos/${id}`);
  }

  const narrator = getProfileById(narration.user_id);

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
