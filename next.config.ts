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
      bodySizeLimit: "550mb",
    },
    // Allow large multipart uploads through Next's proxy/middleware layer
    middlewareClientMaxBodySize: "550mb",
  },
};

export default nextConfig;
