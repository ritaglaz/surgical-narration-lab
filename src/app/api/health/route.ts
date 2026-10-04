import { NextRequest, NextResponse } from "next/server";
import {
  ensureDbReady,
  getDbBackend,
  getPersistenceLabel,
  getDbStats,
} from "@/lib/db";
import {
  isGoogleDriveConfigured,
  probeGoogleDrive,
} from "@/lib/google-drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Non-secret persistence diagnostic for operators.
 * Never returns connection strings or credentials.
 * Add ?drive=1 to also probe Google Drive OAuth + folder access.
 */
export async function GET(req: NextRequest) {
  try {
    await ensureDbReady();
    const backend = getDbBackend();
    const stats = await getDbStats();
    const body: Record<string, unknown> = {
      ok: true,
      database: getPersistenceLabel(),
      backend,
      google_drive_configured: isGoogleDriveConfigured(),
      counts: {
        profiles: stats.profiles,
        videos: stats.videos,
        narrations: stats.narrations,
        invites: stats.invites,
      },
    };

    if (req.nextUrl.searchParams.get("drive") === "1") {
      const drive = await probeGoogleDrive();
      body.google_drive = drive;
      if (!drive.ok) {
        return NextResponse.json({ ...body, ok: false }, { status: 503 });
      }
    }

    return NextResponse.json(body);
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
