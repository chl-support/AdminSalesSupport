/**
 * Pembangkit tanda tangan sintetis untuk data contoh dan pengujian.
 *
 * PNG disusun manual (IHDR + IDAT terkompresi zlib + IEND) supaya tidak perlu
 * pustaka kanvas di sisi server. Bentuknya dapat diulang dari nilai seed, sehingga
 * pengujian pencocokan tanda tangan menghasilkan skor yang stabil.
 */
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const W = 300, H = 100;

function crc32(buf: Buffer): number {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function path(seed: number, wobble = 0): { x: number; y: number; t: number }[] {
  const rnd = seed * 7919;
  const pts = [];
  for (let i = 0; i < 120; i++) {
    const t = i / 119;
    pts.push({
      x: 20 + t * 260,
      y: 50 + 26 * Math.sin(t * 7 + (rnd % 13) * 0.4)
           + 12 * Math.sin(t * 17 + (rnd % 7))
           + wobble * 9 * Math.sin(t * 31 + seed),
      t: Math.round(t * 1800),
    });
  }
  return pts;
}

export function signaturePng(seed: number, wobble = 0): string {
  const alpha = new Uint8Array(W * H);
  const pts = path(seed, wobble);
  const plot = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const px = Math.round(x) + dx, py = Math.round(y) + dy;
        if (px >= 0 && px < W && py >= 0 && py < H) alpha[py * W + px] = 255;
      }
  };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let s = 0; s <= steps; s++) {
      plot(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps);
    }
  }

  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 4);
    raw[off] = 0;
    for (let x = 0; x < W; x++) {
      const o = off + 1 + x * 4;
      raw[o] = 21; raw[o + 1] = 23; raw[o + 2] = 26; raw[o + 3] = alpha[y * W + x];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png.toString("base64");
}

export const strokes = (seed: number, wobble = 0) => [{ points: path(seed, wobble) }];
export const pwHash = (p: string) => createHash("sha256").update(p).digest("hex");
