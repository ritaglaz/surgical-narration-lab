export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensurePersistenceRestored } = await import("@/lib/google-drive");
  await ensurePersistenceRestored();
}
