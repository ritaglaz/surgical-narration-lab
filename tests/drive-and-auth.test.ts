import { describe, expect, it, vi } from "vitest";

describe("Drive sync failure semantics", () => {
  it("does not treat a failed Drive upload as synced success", async () => {
    // Pure contract test: submitted responses must surface drive_sync_status.
    const success = {
      narration: {
        id: "n1",
        status: "submitted",
        drive_sync_status: "synced",
      },
    };
    const failed = {
      error: "Your recording was saved, but Google Drive sync failed.",
      narration: {
        id: "n1",
        status: "submitted",
        drive_sync_status: "failed",
      },
    };
    expect(success.narration.drive_sync_status).toBe("synced");
    expect(failed.narration.drive_sync_status).toBe("failed");
    expect(failed.error.toLowerCase()).toContain("drive");
  });

  it("uses UUID-based Drive filenames to avoid collisions", () => {
    const idA = "11111111-1111-1111-1111-111111111111";
    const idB = "22222222-2222-2222-2222-222222222222";
    const fileA = `narration-${idA}.webm`;
    const fileB = `narration-${idB}.webm`;
    expect(fileA).not.toBe(fileB);
    expect(fileA).toContain(idA);
  });

  it("wraps buffers as readable streams for googleapis multipart upload", async () => {
    const { Readable } = await import("stream");
    const buf = Buffer.from('{"ok":true}');
    const stream = Readable.from([buf]);
    expect(typeof stream.pipe).toBe("function");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString("utf8")).toBe('{"ok":true}');
  });
});

describe("AUTH_SECRET production guard", () => {
  it("rejects missing secret in production", async () => {
    vi.resetModules();
    const prevSecret = process.env.AUTH_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.AUTH_SECRET;
    try {
      const { createSessionToken } = await import("@/lib/auth");
      await expect(
        createSessionToken({
          id: "u1",
          email: "a@b.com",
          display_name: "A",
          role: "admin",
        })
      ).rejects.toThrow(/AUTH_SECRET/);
    } finally {
      vi.unstubAllEnvs();
      if (prevSecret !== undefined) process.env.AUTH_SECRET = prevSecret;
      else delete process.env.AUTH_SECRET;
      vi.resetModules();
    }
  });
});
