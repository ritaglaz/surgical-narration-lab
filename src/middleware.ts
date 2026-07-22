import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/config";

const protectedPrefixes = ["/dashboard", "/videos", "/api/videos", "/api/narrations", "/api/media"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/videos/:path*",
    "/api/videos/:path*",
    "/api/narrations/:path*",
    "/api/media/:path*",
  ],
};
