#!/usr/bin/env node
/**
 * Writes tiny valid-enough WebM-ish fixtures for API smoke tests.
 * These are minimal EBML/WebM headers + padding so browsers/ffmpeg
 * are not required; the server stores and serves bytes as opaque media.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
fs.mkdirSync(dir, { recursive: true });

// Minimal WebM EBML header bytes (not a full playable file, but fine for storage tests)
const header = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
  0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65,
  0x62, 0x6d, 0x42, 0x87, 0x81, 0x02, 0x42, 0x85, 0x81, 0x02,
]);

function writeFixture(name, size) {
  const buf = Buffer.alloc(size);
  header.copy(buf);
  for (let i = header.length; i < size; i++) buf[i] = i % 255;
  fs.writeFileSync(path.join(dir, name), buf);
}

writeFixture("sample.webm", 4096);
writeFixture("sample-audio.webm", 2048);
console.log("Wrote fixtures to", dir);
