#!/usr/bin/env node
/**
 * One-time OAuth setup for personal Google Drive uploads.
 *
 * Prerequisites:
 * 1. Google Cloud Console → APIs & Services → Credentials
 * 2. Create OAuth client ID → Application type: Desktop app
 * 3. Copy client id + secret into env below / .env.local
 *
 * Run:
 *   node scripts/google-drive-auth.mjs
 *
 * Then paste the printed refresh token into .env.local as
 * GOOGLE_OAUTH_REFRESH_TOKEN=...
 */
import http from "http";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env.local first."
  );
  console.error(
    "Create them in Google Cloud → Credentials → Create OAuth client ID → Desktop app."
  );
  process.exit(1);
}

const redirectUri = "http://127.0.0.1:53683/oauth2callback";
const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log("\nOpen this URL in your browser and approve access:\n");
console.log(authUrl);
console.log("\nWaiting for Google redirect on", redirectUri, "...\n");

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url?.startsWith("/oauth2callback")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const url = new URL(req.url, redirectUri);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("No code in callback");
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h1>Google Drive connected</h1><p>You can close this tab and return to the terminal.</p>"
    );
    console.log("\nSUCCESS. Add this to .env.local (and Render env):\n");
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token || ""}`);
    if (!tokens.refresh_token) {
      console.log(
        "\nNo refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and rerun with prompt=consent."
      );
    } else {
      // Auto-append to .env.local if present
      const envFile = path.join(root, ".env.local");
      if (fs.existsSync(envFile)) {
        let env = fs.readFileSync(envFile, "utf8");
        if (env.includes("GOOGLE_OAUTH_REFRESH_TOKEN=")) {
          env = env.replace(
            /^GOOGLE_OAUTH_REFRESH_TOKEN=.*$/m,
            `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`
          );
        } else {
          env += `\nGOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`;
        }
        fs.writeFileSync(envFile, env);
        console.log("\nAlso wrote GOOGLE_OAUTH_REFRESH_TOKEN into .env.local");
      }
    }
    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("Auth failed");
    server.close();
    process.exit(1);
  }
});

server.listen(53683, "127.0.0.1");
