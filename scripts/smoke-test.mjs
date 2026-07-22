#!/usr/bin/env node
/**
 * End-to-end API smoke test:
 * signup → upload video → save narration → fetch media → replay metadata
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVideo = path.join(__dirname, "fixtures", "sample.webm");
const fixtureAudio = path.join(__dirname, "fixtures", "sample-audio.webm");

function parseSetCookie(res) {
  // Node 22 fetch may expose getSetCookie()
  const cookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  return cookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function main() {
  if (!fs.existsSync(fixtureVideo) || !fs.existsSync(fixtureAudio)) {
    throw new Error("Missing fixtures. Run npm run fixtures first.");
  }

  const email = `smoke_${Date.now()}@example.com`;
  const password = "password123";

  const signup = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      display_name: "Smoke Tester",
    }),
  });
  const signupBody = await signup.json();
  if (!signup.ok) throw new Error(`signup failed: ${JSON.stringify(signupBody)}`);
  const cookie = parseSetCookie(signup);
  if (!cookie) throw new Error("No session cookie returned from signup");

  const form = new FormData();
  form.append("title", "Smoke Test Case");
  form.append("procedure_type", "Demo Procedure");
  form.append("description", "Automated smoke test upload");
  form.append("case_id", "SMOKE-1");
  form.append("duration", "1");
  form.append(
    "file",
    new Blob([fs.readFileSync(fixtureVideo)], { type: "video/webm" }),
    "sample.webm"
  );

  const upload = await fetch(`${base}/api/videos`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  const uploadBody = await upload.json();
  if (!upload.ok) throw new Error(`upload failed: ${JSON.stringify(uploadBody)}`);
  const videoId = uploadBody.video.id;

  const narrForm = new FormData();
  narrForm.append("video_id", videoId);
  narrForm.append("narration_mode", "synchronized");
  narrForm.append("status", "submitted");
  narrForm.append("notes", "Smoke test narration");
  narrForm.append("video_start_timestamp", "0");
  narrForm.append("recording_duration", "1");
  narrForm.append(
    "file",
    new Blob([fs.readFileSync(fixtureAudio)], { type: "audio/webm" }),
    "sample-audio.webm"
  );

  const narr = await fetch(`${base}/api/narrations`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: narrForm,
  });
  const narrBody = await narr.json();
  if (!narr.ok) throw new Error(`narration failed: ${JSON.stringify(narrBody)}`);
  const narrationId = narrBody.narration.id;

  const videoMedia = await fetch(`${base}/api/media/video/${videoId}`, {
    headers: { Cookie: cookie },
  });
  if (!videoMedia.ok) throw new Error(`video media failed: ${videoMedia.status}`);

  const audioMedia = await fetch(`${base}/api/media/audio/${narrationId}`, {
    headers: { Cookie: cookie },
  });
  if (!audioMedia.ok) throw new Error(`audio media failed: ${audioMedia.status}`);

  const unauth = await fetch(`${base}/api/media/video/${videoId}`);
  if (unauth.status !== 401) {
    throw new Error(`expected 401 without cookie, got ${unauth.status}`);
  }

  const detail = await fetch(`${base}/api/videos/${videoId}`, {
    headers: { Cookie: cookie },
  });
  const detailBody = await detail.json();
  if (!detail.ok) throw new Error(`video detail failed`);
  if (!detailBody.narrations?.length) throw new Error("narration not listed");

  console.log("SMOKE OK");
  console.log(
    JSON.stringify(
      {
        email,
        videoId,
        narrationId,
        videoBytes: Number(videoMedia.headers.get("content-length") || 0),
        audioBytes: Number(audioMedia.headers.get("content-length") || 0),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("SMOKE FAILED", err);
  process.exit(1);
});
