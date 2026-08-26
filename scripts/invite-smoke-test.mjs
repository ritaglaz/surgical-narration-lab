#!/usr/bin/env node
/**
 * Invite + assignment isolation smoke (requires running server):
 * admin signup → upload 2 videos → invite narrator to video1 only →
 * accept invite → confirm only video1 listed → reject video2 access.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3030";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureVideo = path.join(__dirname, "fixtures", "sample.webm");

function parseSetCookie(res) {
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
  if (!fs.existsSync(fixtureVideo)) {
    throw new Error("Missing fixtures. Run npm run fixtures first.");
  }

  const stamp = Date.now();
  const adminEmail = `invite_admin_${stamp}@example.com`;
  const narrEmail = `invite_narr_${stamp}@example.com`;
  const password = "password12345";

  const signup = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: adminEmail,
      password,
      display_name: "Invite Admin",
    }),
  });
  const signupBody = await signup.json();
  if (!signup.ok) {
    // If bootstrap closed, try login as existing allowlisted admin is not available locally.
    throw new Error(`signup failed: ${JSON.stringify(signupBody)}`);
  }
  const adminCookie = parseSetCookie(signup);

  async function upload(title) {
    const form = new FormData();
    form.append("title", title);
    form.append("procedure_type", "Invite Test");
    form.append("case_id", `CURSOR_E2E_${stamp}`);
    form.append("duration", "1");
    form.append(
      "file",
      new Blob([fs.readFileSync(fixtureVideo)], { type: "video/webm" }),
      "sample.webm"
    );
    const res = await fetch(`${base}/api/videos`, {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: form,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`upload failed: ${JSON.stringify(body)}`);
    return body.video.id;
  }

  const video1 = await upload("CURSOR_E2E_TEST_DO_NOT_USE video 1");
  const video2 = await upload("CURSOR_E2E_TEST_DO_NOT_USE video 2");

  const inviteRes = await fetch(`${base}/api/invites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      email: narrEmail,
      display_name: "CURSOR_E2E Narrator",
      video_ids: [video1],
    }),
  });
  const inviteBody = await inviteRes.json();
  if (!inviteRes.ok) throw new Error(`invite failed: ${JSON.stringify(inviteBody)}`);
  if (inviteBody.invite?.token) {
    throw new Error("Invite API leaked token to client");
  }
  const inviteUrl = inviteBody.inviteUrl;
  const token = inviteUrl.split("/invite/")[1];
  if (!token) throw new Error("Could not parse invite token from URL");

  const accept = await fetch(`${base}/api/invites/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: "CURSOR_E2E Narrator" }),
  });
  const acceptBody = await accept.json();
  if (!accept.ok) throw new Error(`accept failed: ${JSON.stringify(acceptBody)}`);
  const narrCookie = parseSetCookie(accept);

  const list = await fetch(`${base}/api/videos`, {
    headers: { Cookie: narrCookie },
  });
  const listBody = await list.json();
  if (!list.ok) throw new Error(`list failed: ${JSON.stringify(listBody)}`);
  const ids = (listBody.videos || []).map((v) => v.id);
  if (!ids.includes(video1) || ids.includes(video2)) {
    throw new Error(`assignment mismatch: saw ${JSON.stringify(ids)}`);
  }

  const denied = await fetch(`${base}/api/videos/${video2}`, {
    headers: { Cookie: narrCookie },
  });
  if (denied.status !== 403) {
    throw new Error(`expected 403 for unassigned video, got ${denied.status}`);
  }

  const mediaDenied = await fetch(`${base}/api/media/video/${video2}`, {
    headers: { Cookie: narrCookie },
  });
  if (mediaDenied.status !== 403) {
    throw new Error(`expected 403 media for unassigned, got ${mediaDenied.status}`);
  }

  console.log("INVITE SMOKE OK");
  console.log(
    JSON.stringify({ adminEmail, narrEmail, video1, video2, assigned: ids }, null, 2)
  );
}

main().catch((err) => {
  console.error("INVITE SMOKE FAILED", err);
  process.exit(1);
});
