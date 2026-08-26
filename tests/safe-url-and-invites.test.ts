import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-url";
import { toPublicInvite } from "@/lib/types";
import type { InviteWithVideos } from "@/lib/types";

describe("safeNextPath", () => {
  it("allows relative app paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/admin/invites")).toBe("/admin/invites");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("dashboard")).toBe("/dashboard");
  });
});

describe("toPublicInvite", () => {
  it("strips bearer tokens before client exposure", () => {
    const invite: InviteWithVideos = {
      id: "i1",
      email: "n@example.com",
      display_name: "Narrator",
      token: "super-secret-token",
      invited_by: "a1",
      accepted_at: null,
      user_id: null,
      expires_at: "2099-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      video_ids: ["v1"],
      video_titles: ["Case 1"],
      invited_by_name: "Admin",
    };
    const pub = toPublicInvite(invite);
    expect(pub.email).toBe("n@example.com");
    expect(pub.video_ids).toEqual(["v1"]);
    expect((pub as { token?: string }).token).toBeUndefined();
  });
});
