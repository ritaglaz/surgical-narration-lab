import { NextResponse } from "next/server";
import {
  AuthError,
  createSessionToken,
  setSessionCookie,
  signupUser,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { ensurePersistenceRestored, queueDatabaseSync } = await import(
      "@/lib/google-drive"
    );
    await ensurePersistenceRestored();

    const body = await req.json();
    const user = await signupUser({
      email: String(body.email || ""),
      password: String(body.password || ""),
      display_name: String(body.display_name || ""),
    });
    const token = await createSessionToken(user);
    await setSessionCookie(token);
    queueDatabaseSync();
    return NextResponse.json({ user });
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json(
      { error: err.message || "Signup failed" },
      { status: err.status || 400 }
    );
  }
}
