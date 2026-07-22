import Busboy from "busboy";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import type { ReadableStream as NodeWebReadableStream } from "stream/web";
import { resolveStoragePath } from "./storage";

export type MultipartFile = {
  fieldname: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  size: number;
};

export type ParsedMultipart = {
  fields: Record<string, string>;
  file: MultipartFile | null;
};

/**
 * Stream a single multipart file to disk without buffering the whole upload in RAM.
 */
export function parseMultipartToDisk(
  req: Request,
  opts: {
    fileField?: string;
    maxFileBytes: number;
    buildStoragePath: (info: {
      filename: string;
      mimeType: string;
    }) => string;
  }
): Promise<ParsedMultipart> {
  const contentType = req.headers.get("content-type");
  if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
    return Promise.reject(
      new Error(`Expected multipart/form-data, got: ${contentType || "(missing)"}`)
    );
  }
  if (!req.body) {
    return Promise.reject(new Error("Missing request body"));
  }

  const fileField = opts.fileField || "file";

  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: MultipartFile | null = null;
    let settled = false;
    let busboyDone = false;
    let writeDone = true;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      if (file?.storagePath) {
        try {
          fs.unlinkSync(resolveStoragePath(file.storagePath));
        } catch {
          // ignore
        }
      }
      reject(err);
    };

    const maybeResolve = () => {
      if (settled || !busboyDone || !writeDone) return;
      settled = true;
      resolve({ fields, file });
    };

    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: {
        files: 1,
        fileSize: opts.maxFileBytes,
      },
    });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("file", (name, stream, info) => {
      if (name !== fileField) {
        stream.resume();
        return;
      }

      writeDone = false;
      const mimeType = info.mimeType || "application/octet-stream";
      const filename = info.filename || "upload.bin";
      const storagePath = opts.buildStoragePath({ filename, mimeType });
      const abs = resolveStoragePath(storagePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });

      let size = 0;
      const out = fs.createWriteStream(abs);
      file = { fieldname: name, filename, mimeType, storagePath, size: 0 };

      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
      });

      stream.on("limit", () => {
        stream.unpipe(out);
        out.destroy();
        try {
          fs.unlinkSync(abs);
        } catch {
          // ignore
        }
        file = null;
        fail(
          new Error(
            `File exceeds maximum size of ${Math.round(opts.maxFileBytes / (1024 * 1024))} MB`
          )
        );
      });

      out.on("error", (err) =>
        fail(err instanceof Error ? err : new Error(String(err)))
      );
      stream.on("error", (err) =>
        fail(err instanceof Error ? err : new Error(String(err)))
      );

      stream.pipe(out);
      out.on("finish", () => {
        if (file) file.size = size;
        writeDone = true;
        maybeResolve();
      });
    });

    bb.on("error", (err) =>
      fail(err instanceof Error ? err : new Error(String(err)))
    );

    bb.on("finish", () => {
      busboyDone = true;
      maybeResolve();
    });

    const nodeReadable = Readable.fromWeb(
      req.body as unknown as NodeWebReadableStream
    );
    nodeReadable.on("error", (err) =>
      fail(err instanceof Error ? err : new Error(String(err)))
    );
    nodeReadable.pipe(bb);
  });
}
