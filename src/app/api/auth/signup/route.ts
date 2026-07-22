import { NextResponse } from "next/server";
import {
  AuthError,
  createSessionToken,
  setSessionCookie,
  signupUser,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const user = await signupUser({
      email: String(body.email || ""),
      password: String(body.password || ""),
      display_name: String(body.display_name || ""),
      role: body.role === "admin" ? "admin" : undefined,
    });
    const token = await createSessionToken(user);
    await setSessionCookie(token);
    return NextResponse.json({ user });
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json(
      { error: err.message || "Signup failed" },
      { status: err.status || 400 }
    );
  }
}
