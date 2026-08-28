import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "crypto";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snl-persist-"));
process.env.DATA_DIR = tmp;
delete process.env.DATABASE_URL;
delete process.env.RENDER;
delete process.env.RENDER_SERVICE_ID;
process.env.AUTH_SECRET = "vitest-auth-secret-at-least-32-chars!!";
process.env.GOOGLE_DRIVE_SYNC = "false";
process.env.NODE_ENV = "test";

describe("sqlite persistence across reopen", () => {
  let createProfile: typeof import("@/lib/db").createProfile;
  let createInvite: typeof import("@/lib/db").createInvite;
  let createVideo: typeof import("@/lib/db").createVideo;
  let getInviteByToken: typeof import("@/lib/db").getInviteByToken;
  let getProfileByEmail: typeof import("@/lib/db").getProfileByEmail;
  let assignVideoToUser: typeof import("@/lib/db").assignVideoToUser;
  let userHasVideoAccess: typeof import("@/lib/db").userHasVideoAccess;
  let createNarration: typeof import("@/lib/db").createNarration;
  let getNarrationById: typeof import("@/lib/db").getNarrationById;
  let updateNarration: typeof import("@/lib/db").updateNarration;
  let closeDb: typeof import("@/lib/db").closeDb;
  let ensureDbReady: typeof import("@/lib/db").ensureDbReady;
  let getDbBackend: typeof import("@/lib/db").getDbBackend;
  let execute: typeof import("@/lib/db-engine").execute;

  const token = randomBytes(24).toString("hex");
  const expiredToken = randomBytes(24).toString("hex");
  const adminId = randomUUID();
  const videoId = randomUUID();
  const narrId = randomUUID();
  const narrationId = randomUUID();

  beforeAll(async () => {
    const db = await import("@/lib/db");
    const engine = await import("@/lib/db-engine");
    createProfile = db.createProfile;
    createInvite = db.createInvite;
    createVideo = db.createVideo;
    getInviteByToken = db.getInviteByToken;
    getProfileByEmail = db.getProfileByEmail;
    assignVideoToUser = db.assignVideoToUser;
    userHasVideoAccess = db.userHasVideoAccess;
    createNarration = db.createNarration;
    getNarrationById = db.getNarrationById;
    updateNarration = db.updateNarration;
    closeDb = db.closeDb;
    ensureDbReady = db.ensureDbReady;
    getDbBackend = db.getDbBackend;
    execute = engine.execute;

    await ensureDbReady();
    expect(getDbBackend()).toBe("sqlite");

    await createProfile({
      id: adminId,
      email: "persist-admin@example.com",
      password_hash: "hashed",
      display_name: "Persist Admin",
      role: "admin",
    });
    await createVideo({
      id: videoId,
      title: "Persist Video",
      procedure_type: "Test",
      video_storage_path: `videos/${videoId}.webm`,
      uploaded_by: adminId,
    });
    await createInvite({
      id: randomUUID(),
      email: "persist-narr@example.com",
      display_name: "Persist Narr",
      token,
      invited_by: adminId,
      expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
      video_ids: [videoId],
    });
    await createInvite({
      id: randomUUID(),
      email: "expired-narr@example.com",
      display_name: "Expired Narr",
      token: expiredToken,
      invited_by: adminId,
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      video_ids: [videoId],
    });
    await createProfile({
      id: narrId,
      email: "persist-narr@example.com",
      password_hash: "",
      display_name: "Persist Narr",
      role: "narrator",
    });
    await assignVideoToUser({
      id: randomUUID(),
      video_id: videoId,
      user_id: narrId,
      invited_by: adminId,
    });
    await createNarration({
      id: narrationId,
      video_id: videoId,
      user_id: narrId,
      narration_mode: "dictation",
      status: "submitted",
      next_step: "close",
      audio_storage_path: `audio/${narrationId}.webm`,
    });
    await updateNarration(narrationId, {
      drive_audio_file_id: "drive-file-abc123",
      drive_sync_status: "synced",
    });

    await closeDb();
    await ensureDbReady();
  });

  afterAll(async () => {
    await closeDb();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("keeps admin account after reopen", async () => {
    const admin = await getProfileByEmail("persist-admin@example.com");
    expect(admin?.role).toBe("admin");
    expect(admin?.password_hash).toBe("hashed");
  });

  it("keeps the same invite token valid after reopen", async () => {
    const invite = await getInviteByToken(token);
    expect(invite).not.toBeNull();
    expect(invite!.video_ids).toEqual([videoId]);
    expect(invite!.email).toBe("persist-narr@example.com");
  });

  it("keeps assignments after reopen", async () => {
    expect(await userHasVideoAccess(narrId, videoId)).toBe(true);
  });

  it("keeps submitted narrations after reopen", async () => {
    const n = await getNarrationById(narrationId);
    expect(n?.status).toBe("submitted");
    expect(n?.user_id).toBe(narrId);
    expect(n?.drive_audio_file_id).toBe("drive-file-abc123");
    expect(n?.drive_sync_status).toBe("synced");
  });

  it("rejects unknown invite tokens", async () => {
    expect(await getInviteByToken("not-a-real-token")).toBeNull();
  });

  it("keeps expired invite rows after reopen (still expired)", async () => {
    const invite = await getInviteByToken(expiredToken);
    expect(invite).not.toBeNull();
    expect(new Date(invite!.expires_at).getTime()).toBeLessThan(Date.now());
  });

  it("keeps intentionally deleted invite gone after reopen", async () => {
    const doomed = randomBytes(24).toString("hex");
    await createInvite({
      id: randomUUID(),
      email: "doomed@example.com",
      display_name: "Doomed",
      token: doomed,
      invited_by: adminId,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      video_ids: [videoId],
    });
    await execute(`DELETE FROM invites WHERE token = ?`, [doomed]);
    await closeDb();
    await ensureDbReady();
    expect(await getInviteByToken(doomed)).toBeNull();
  });
});

describe("production requires DATABASE_URL", () => {
  it("refuses sqlite fallback when RENDER is set without DATABASE_URL", async () => {
    vi.resetModules();
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("DATABASE_URL", "");
    delete process.env.DATABASE_URL;
    const { getDbBackend } = await import("@/lib/db-engine");
    expect(() => getDbBackend()).toThrow(/DATABASE_URL/);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
