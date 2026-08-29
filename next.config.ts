import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "pg",
    "googleapis",
    "google-auth-library",
    "gaxios",
    "https-proxy-agent",
    "agent-base",
  ],
  experimental: {
    serverActions: {
      // Must be >= MAX_VIDEO_BYTES (default 2 GB)
      bodySizeLimit: "2048mb",
    },
    // Allow large multipart uploads through Next's proxy/middleware layer
    middlewareClientMaxBodySize: "2048mb",
  },
};

export default nextConfig;
