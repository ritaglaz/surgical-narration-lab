import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snl-access-"));
process.env.DATA_DIR = tmp;
process.env.AUTH_SECRET = "vitest-auth-secret-at-least-32-chars!!";
process.env.GOOGLE_DRIVE_SYNC = "false";
process.env.ADMIN_EMAILS = "admin-a@example.com,admin-b@example.com";

describe("assignment isolation matrix", () => {
  let createProfile: typeof import("@/lib/db").createProfile;
  let createVideo: typeof import("@/lib/db").createVideo;
  let assignVideoToUser: typeof import("@/lib/db").assignVideoToUser;
  let listVideos: typeof import("@/lib/db").listVideos;
  let userHasVideoAccess: typeof import("@/lib/db").userHasVideoAccess;
  let canAccessVideo: typeof import("@/lib/access").canAccessVideo;
  let isAdmin: typeof import("@/lib/access").isAdmin;
  let closeDbForRestore: typeof import("@/lib/db").closeDbForRestore;

  const ids = {
    adminA: randomUUID(),
    adminB: randomUUID(),
    narrA: randomUUID(),
    narrB: randomUUID(),
    narrC: randomUUID(),
    v1: randomUUID(),
    v2: randomUUID(),
    v3: randomUUID(),
    v4: randomUUID(),
  };

  beforeAll(async () => {
    const db = await import("@/lib/db");
    const access = await import("@/lib/access");
    createProfile = db.createProfile;
    createVideo = db.createVideo;
    assignVideoToUser = db.assignVideoToUser;
    listVideos = db.listVideos;
    userHasVideoAccess = db.userHasVideoAccess;
    canAccessVideo = access.canAccessVideo;
    isAdmin = access.isAdmin;
    closeDbForRestore = db.closeDbForRestore;

    createProfile({
      id: ids.adminA,
      email: "admin-a@example.com",
      password_hash: "x",
      display_name: "Admin A",
      role: "admin",
    });
    createProfile({
      id: ids.adminB,
      email: "admin-b@example.com",
      password_hash: "x",
      display_name: "Admin B",
      role: "admin",
    });
    createProfile({
      id: ids.narrA,
      email: "narr-a@example.com",
      password_hash: "",
      display_name: "Narrator A",
      role: "narrator",
    });
    createProfile({
      id: ids.narrB,
      email: "narr-b@example.com",
      password_hash: "",
      display_name: "Narrator B",
      role: "narrator",
    });
    createProfile({
      id: ids.narrC,
      email: "narr-c@example.com",
      password_hash: "",
      display_name: "Narrator C",
      role: "narrator",
    });

    for (const [id, title] of [
      [ids.v1, "Video 1"],
      [ids.v2, "Video 2"],
      [ids.v3, "Video 3"],
      [ids.v4, "Video 4"],
    ] as const) {
      createVideo({
        id,
        title,
        procedure_type: "Test",
        description: null,
        case_id: null,
        video_storage_path: `videos/${id}.webm`,
        duration: 1,
        uploaded_by: ids.adminA,
      });
    }

    // A: 1,2  B: 2,3  C: 4
    assignVideoToUser({
      id: randomUUID(),
      video_id: ids.v1,
      user_id: ids.narrA,
      invited_by: ids.adminA,
    });
    assignVideoToUser({
      id: randomUUID(),
      video_id: ids.v2,
      user_id: ids.narrA,
      invited_by: ids.adminA,
    });
    assignVideoToUser({
      id: randomUUID(),
      video_id: ids.v2,
      user_id: ids.narrB,
      invited_by: ids.adminA,
    });
    assignVideoToUser({
      id: randomUUID(),
      video_id: ids.v3,
      user_id: ids.narrB,
      invited_by: ids.adminA,
    });
    assignVideoToUser({
      id: randomUUID(),
      video_id: ids.v4,
      user_id: ids.narrC,
      invited_by: ids.adminB,
    });
  });

  afterAll(() => {
    closeDbForRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("lists only assigned videos for each narrator", () => {
    const a = listVideos({ assignedToUserId: ids.narrA }).map((v) => v.id).sort();
    const b = listVideos({ assignedToUserId: ids.narrB }).map((v) => v.id).sort();
    const c = listVideos({ assignedToUserId: ids.narrC }).map((v) => v.id).sort();
    expect(a).toEqual([ids.v1, ids.v2].sort());
    expect(b).toEqual([ids.v2, ids.v3].sort());
    expect(c).toEqual([ids.v4]);
  });

  it("allows shared video access without mixing identities", () => {
    expect(userHasVideoAccess(ids.narrA, ids.v2)).toBe(true);
    expect(userHasVideoAccess(ids.narrB, ids.v2)).toBe(true);
    expect(userHasVideoAccess(ids.narrC, ids.v2)).toBe(false);
  });

  it("blocks unassigned video access via canAccessVideo", () => {
    const narrA = {
      id: ids.narrA,
      email: "narr-a@example.com",
      display_name: "Narrator A",
      role: "narrator" as const,
    };
    expect(canAccessVideo(narrA, ids.v1)).toBe(true);
    expect(canAccessVideo(narrA, ids.v3)).toBe(false);
    expect(canAccessVideo(narrA, ids.v4)).toBe(false);
  });

  it("lets both admins see the full shared library", () => {
    const adminA = {
      id: ids.adminA,
      email: "admin-a@example.com",
      display_name: "Admin A",
      role: "admin" as const,
    };
    const adminB = {
      id: ids.adminB,
      email: "admin-b@example.com",
      display_name: "Admin B",
      role: "admin" as const,
    };
    expect(isAdmin(adminA)).toBe(true);
    expect(isAdmin(adminB)).toBe(true);
    expect(canAccessVideo(adminA, ids.v4)).toBe(true);
    expect(canAccessVideo(adminB, ids.v1)).toBe(true);
    expect(listVideos({}).map((v) => v.id).sort()).toEqual(
      [ids.v1, ids.v2, ids.v3, ids.v4].sort()
    );
  });
});
