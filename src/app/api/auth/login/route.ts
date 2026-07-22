import { NextResponse } from "next/server";
import {
  AuthError,
  createSessionToken,
  loginUser,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const user = await loginUser(
      String(body.email || ""),
      String(body.password || "")
    );
    const token = await createSessionToken(user);
    await setSessionCookie(token);
    return NextResponse.json({ user });
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json(
      { error: err.message || "Login failed" },
      { status: err.status || 401 }
    );
  }
}
