import fs from "fs";
import path from "path";
import { getDataDir } from "./config";

function storageRoot() {
  const root = path.resolve(getDataDir(), "storage");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** Resolve an absolute path for a storage-relative path. Prevents path traversal. */
export function resolveStoragePath(storagePath: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, storagePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

export async function saveFile(
  storagePath: string,
  data: Buffer | Uint8Array
): Promise<string> {
  const abs = resolveStoragePath(storagePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  return storagePath;
}

export function fileExists(storagePath: string): boolean {
  try {
    return fs.existsSync(resolveStoragePath(storagePath));
  } catch {
    return false;
  }
}

export function readFileStream(storagePath: string): fs.ReadStream {
  return fs.createReadStream(resolveStoragePath(storagePath));
}

export function readFileBuffer(storagePath: string): Buffer {
  return fs.readFileSync(resolveStoragePath(storagePath));
}

export function deleteFile(storagePath: string): void {
  try {
    const abs = resolveStoragePath(storagePath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    // ignore
  }
}

export function contentTypeForPath(storagePath: string): string {
  const ext = path.extname(storagePath).toLowerCase();
  const isAudio = storagePath.replace(/\\/g, "/").includes("/audio/");
  switch (ext) {
    case ".mp4":
      return isAudio ? "audio/mp4" : "video/mp4";
    case ".webm":
      return isAudio ? "audio/webm" : "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".ogg":
      return "audio/ogg";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
}
