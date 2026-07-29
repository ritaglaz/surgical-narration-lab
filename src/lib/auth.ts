import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS } from "./config";
import {
  assignVideoToUser,
  canBootstrapAdmin,
  createProfile,
  getInviteByToken,
  getProfileByEmail,
  getProfileById,
  markInviteAccepted,
  setProfileRole,
  updateProfileDisplayName,
  updateProfilePassword,
} from "./db";
import type { SessionUser, UserRole } from "./types";
import { randomUUID } from "crypto";

/** Placeholder hash for invite-only narrators (cannot log in with a password). */
const INVITE_ONLY_PASSWORD_PLACEHOLDER = "";

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
  if (!hash) return false;
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

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError("Admin access required", 403);
  return user;
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Creates or claims the first admin account.
 * Allowed only while no admin exists (even if invite-only narrators already exist).
 */
export async function signupUser(input: {
  email: string;
  password: string;
  display_name: string;
}): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || input.password.length < 8) {
    throw new AuthError("Valid email and password (min 8 characters) required");
  }

  if (!canBootstrapAdmin()) {
    throw new AuthError(
      "An admin already exists. Log in, or ask an admin to invite you.",
      403
    );
  }

  const password_hash = await hashPassword(input.password);
  const display_name = input.display_name.trim() || email.split("@")[0];
  const existing = getProfileByEmail(email);

  if (existing) {
    updateProfilePassword(existing.id, password_hash);
    setProfileRole(existing.id, "admin");
    if (display_name) updateProfileDisplayName(existing.id, display_name);
    const profile = getProfileById(existing.id)!;
    return {
      id: profile.id,
      email: profile.email,
      display_name: profile.display_name,
      role: profile.role,
    };
  }

  const id = randomUUID();
  const profile = createProfile({
    id,
    email,
    password_hash,
    display_name,
    role: "admin",
  });

  return {
    id: profile.id,
    email: profile.email,
    display_name: profile.display_name,
    role: profile.role,
  };
}

/**
 * Passwordless invite access: the email link is enough.
 * Creates a lightweight narrator profile if needed (no password / no account signup).
 */
export async function acceptInvite(input: {
  token: string;
  display_name?: string;
}): Promise<SessionUser> {
  const invite = getInviteByToken(input.token);
  if (!invite) throw new AuthError("Invitation not found", 404);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new AuthError("This invitation has expired", 410);
  }

  const email = invite.email.trim().toLowerCase();
  let profile = getProfileByEmail(email);
  let userId: string;

  if (profile) {
    userId = profile.id;
    // Never elevate admins/narrators roles via invite; only ensure display name.
    if (input.display_name?.trim()) {
      updateProfileDisplayName(userId, input.display_name.trim());
      profile = getProfileByEmail(email)!;
    }
  } else {
    userId = randomUUID();
    const display_name =
      input.display_name?.trim() ||
      invite.display_name?.trim() ||
      email.split("@")[0];
    createProfile({
      id: userId,
      email,
      password_hash: INVITE_ONLY_PASSWORD_PLACEHOLDER,
      display_name,
      role: "narrator",
    });
    profile = getProfileByEmail(email)!;
  }

  for (const videoId of invite.video_ids) {
    assignVideoToUser({
      id: randomUUID(),
      video_id: videoId,
      user_id: userId,
      invited_by: invite.invited_by,
    });
  }

  markInviteAccepted(invite.id, userId);

  const fresh = getProfileById(userId)!;
  return {
    id: fresh.id,
    email: fresh.email,
    display_name: fresh.display_name,
    role: fresh.role,
  };
}

export async function loginUser(
  email: string,
  password: string
): Promise<SessionUser> {
  const profile = getProfileByEmail(email.trim().toLowerCase());
  if (!profile) throw new AuthError("Invalid email or password");
  if (!profile.password_hash) {
    throw new AuthError(
      "This email uses an invitation link to access videos — no password login. Open the link from your invite email."
    );
  }
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
