import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS } from "./config";
import { createProfile, getProfileByEmail, getProfileById } from "./db";
import type { SessionUser, UserRole } from "./types";
import { randomUUID } from "crypto";

function getSecret() {
  const secret = process.env.AUTH_SECRET || "dev-only-change-me-snl-secret-key";
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.id !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.display_name !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }
    return {
      id: payload.id,
      email: payload.email,
      display_name: payload.display_name,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  // Ensure profile still exists
  const profile = getProfileById(session.id);
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    role: profile.role,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Authentication required");
  return user;
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function signupUser(input: {
  email: string;
  password: string;
  display_name: string;
  role?: UserRole;
}): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || input.password.length < 8) {
    throw new AuthError("Valid email and password (min 8 characters) required");
  }
  if (getProfileByEmail(email)) {
    throw new AuthError("An account with this email already exists");
  }

  const countRow = (
    await import("./db")
  ).getDb()
    .prepare(`SELECT COUNT(*) AS c FROM profiles`)
    .get() as { c: number };

  // First registered user becomes admin for convenience
  const role: UserRole =
    input.role || (countRow.c === 0 ? "admin" : "narrator");

  const id = randomUUID();
  const password_hash = await hashPassword(input.password);
  const profile = createProfile({
    id,
    email,
    password_hash,
    display_name: input.display_name.trim() || email.split("@")[0],
    role,
  });

  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    role: profile.role,
  };
}

export async function loginUser(
  email: string,
  password: string
): Promise<SessionUser> {
  const profile = getProfileByEmail(email.trim().toLowerCase());
  if (!profile) throw new AuthError("Invalid email or password");
  const ok = await verifyPassword(password, profile.password_hash);
  if (!ok) throw new AuthError("Invalid email or password");
  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    role: profile.role,
  };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function getUserFromRequest(
  req: NextRequest
): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
