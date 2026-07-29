import { NextResponse } from "next/server";
import {
  AuthError,
  createSessionToken,
  loginUser,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { ensurePersistenceRestored, queueDatabaseSync } = await import(
      "@/lib/google-drive"
    );
    await ensurePersistenceRestored();

    const body = await req.json();
    const user = await loginUser(
      String(body.email || ""),
      String(body.password || "")
    );
    const token = await createSessionToken(user);
    await setSessionCookie(token);
    // Role allowlist may update the DB; keep Drive backup current.
    queueDatabaseSync();
    return NextResponse.json({ user });
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json(
      { error: err.message || "Login failed" },
      { status: err.status || 401 }
    );
  }
}
