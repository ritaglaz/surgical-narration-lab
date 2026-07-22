import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/config";

/**
 * Protect page routes only.
 * Do NOT run middleware on /api/videos or /api/narrations — Next.js middleware
 * can break multipart/form-data bodies and cause "Invalid multipart form data".
 * Those API routes already call getSessionUser() themselves.
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/videos/:path*"],
};
