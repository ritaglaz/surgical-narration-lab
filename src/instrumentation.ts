/**
 * Next.js instrumentation — runs when the server process starts.
 * Env-only fail-fast: do not import db/pg here (webpack cannot bundle native deps).
 * Schema init happens on first request via ensureDbReady() / /api/health.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const onRender =
    process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);
  const missingUrl = !process.env.DATABASE_URL?.trim();

  if (onRender && missingUrl) {
    console.error(
      "[db] FATAL: DATABASE_URL is required on Render. Attach a PostgreSQL database and set DATABASE_URL. Refusing to start with ephemeral SQLite."
    );
    process.exit(1);
  }
}
