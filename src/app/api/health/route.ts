import { NextResponse } from "next/server";
import {
  ensureDbReady,
  getDbBackend,
  getPersistenceLabel,
  getDbStats,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Non-secret persistence diagnostic for operators.
 * Never returns connection strings or credentials.
 */
export async function GET() {
  try {
    await ensureDbReady();
    const backend = getDbBackend();
    const stats = await getDbStats();
    return NextResponse.json({
      ok: true,
      database: getPersistenceLabel(),
      backend,
      counts: {
        profiles: stats.profiles,
        videos: stats.videos,
        narrations: stats.narrations,
        invites: stats.invites,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database unavailable";
    console.error("[health]", message);
    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        error: message,
      },
      { status: 503 }
    );
  }
}
