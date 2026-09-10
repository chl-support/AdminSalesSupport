/**
 * Mesin pencocokan tanda tangan.
 *
 * Dua lapis, sama seperti versi Python:
 *   - statis  : citra dinormalisasi, dibandingkan lewat IoU, momen Hu, profil
 *               proyeksi, dan rasio aspek;
 *   - dinamis : urutan titik diresampel seragam lalu dibandingkan dengan Dynamic
 *               Time Warping, menangkap ritme dan urutan goresan.
 *
 * PNG didekode manual (chunk IHDR/IDAT, inflate lewat zlib bawaan Node) agar tidak
 * ada ketergantungan pada pustaka citra berbasis binary. Cukup untuk PNG RGBA/8-bit
 * yang dihasilkan `canvas.toDataURL()`, yang memang satu-satunya sumber di sini.
 *
 * PERINGATAN KALIBRASI
 * Skor modul ini belum dikalibrasi. Ambang 75 pada konfigurasi adalah nilai
 * sementara dari PRD, bukan hasil pengukuran. Jalankan protokol PRD 12.2 sebelum
 * dipakai produksi.
 */

import { inflateSync } from "node:zlib";

const GRID = 64;
const RESAMPLE_N = 64;

export type StrokePoint = { x: number; y: number; t?: number; pressure?: number };
export type Stroke = { points: StrokePoint[] };

export type MatchResult = {
  score: number;
  layersUsed: string[];
  detail: Record<string, unknown>;
  guidance: string[];
};

// ─────────────────────────── Dekode PNG ───────────────────────────

function decodePng(b64: string): { w: number; h: number; data: Uint8Array } {
  const raw = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const buf = Buffer.from(raw, "base64");
  let pos = 8; // lewati signature
  let w = 0, h = 0, bitDepth = 8, colorType = 6;
  const idat: Buffer[] = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!w || !h) throw new Error("PNG tidak valid: IHDR tidak ditemukan");
  if (bitDepth !== 8) throw new Error(`Kedalaman bit ${bitDepth} tidak didukung`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType] ?? 4;
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = new Uint8Array(h * stride);

  // Balik filter per baris sesuai spesifikasi PNG.
  let src = 0;
  for (let y = 0; y < h; y++) {
    const filter = inflated[src++];
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const rawByte = inflated[src++];
      const a = i >= channels ? out[row + i - channels] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= channels ? out[prev + i - channels] : 0;
      let value: number;
      switch (filter) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          value = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Filter PNG ${filter} tidak dikenal`);
      }
      out[row + i] = value & 0xff;
    }
  }
  return { w, h, data: outToInk(out, w, h, channels) };
}

/** Ubah piksel mentah menjadi peta tinta (1 = ada goresan). */
function outToInk(px: Uint8Array, w: number, h: number, ch: number): Uint8Array {
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * ch;
    if (ch === 4) ink[i] = px[o + 3] > 32 ? 1 : 0;
    else if (ch === 2) ink[i] = px[o + 1] > 32 ? 1 : 0;
    else if (ch === 3) ink[i] = (px[o] + px[o + 1] + px[o + 2]) / 3 < 200 ? 1 : 0;
    else ink[i] = px[o] < 200 ? 1 : 0;
  }
  return ink;
}

/** Pangkas ke kotak isi, jaga rasio aspek, tempatkan di tengah kanvas GRID. */
function normalise(b64: string): Uint8Array {
  const { w, h, data } = decodePng(b64);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const grid = new Uint8Array(GRID * GRID);
  if (maxX < 0) return grid;

  const cw = maxX - minX + 1;
  const chh = maxY - minY + 1;
  const scale = (GRID - 8) / Math.max(cw, chh);
  const nw = Math.max(1, Math.round(cw * scale));
  const nh = Math.max(1, Math.round(chh * scale));
  const ox = Math.floor((GRID - nw) / 2);
  const oy = Math.floor((GRID - nh) / 2);

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      // Rata-rata area sumber: lebih tahan aliasing daripada nearest-neighbour.
      const sx0 = minX + Math.floor((x * cw) / nw);
      const sx1 = minX + Math.max(sx0 + 1 - minX, Math.floor(((x + 1) * cw) / nw));
      const sy0 = minY + Math.floor((y * chh) / nh);
      const sy1 = minY + Math.max(sy0 + 1 - minY, Math.floor(((y + 1) * chh) / nh));
      let hit = 0, total = 0;
      for (let sy = sy0; sy < Math.min(sy1, h); sy++) {
        for (let sx = sx0; sx < Math.min(sx1, w); sx++) {
          total++;
          if (data[sy * w + sx]) hit++;
        }
      }
      if (total && hit / total > 0.25) grid[(oy + y) * GRID + (ox + x)] = 1;
    }
  }
  return grid;
}

function dilate(mask: Uint8Array, r = 1): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!mask[y * GRID + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < GRID && nx >= 0 && nx < GRID) out[ny * GRID + nx] = 1;
        }
      }
    }
  }
  return out;
}

function huMoments(mask: Uint8Array): number[] {
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (mask[y * GRID + x]) { xs.push(x); ys.push(y); }
  if (!xs.length) return new Array(7).fill(0);

  const m00 = xs.length;
  const xb = xs.reduce((a, b) => a + b, 0) / m00;
  const yb = ys.reduce((a, b) => a + b, 0) / m00;
  const mu = (p: number, q: number) =>
    xs.reduce((acc, _, i) => acc + (xs[i] - xb) ** p * (ys[i] - yb) ** q, 0);
  const nu = (p: number, q: number) => mu(p, q) / m00 ** (1 + (p + q) / 2);

  const n20 = nu(2, 0), n02 = nu(0, 2), n11 = nu(1, 1);
  const n30 = nu(3, 0), n03 = nu(0, 3), n21 = nu(2, 1), n12 = nu(1, 2);

  const h = [
    n20 + n02,
    (n20 - n02) ** 2 + 4 * n11 ** 2,
    (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2,
    (n30 + n12) ** 2 + (n21 + n03) ** 2,
    (n30 - 3 * n12) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) +
      (3 * n21 - n03) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2),
    (n20 - n02) * ((n30 + n12) ** 2 - (n21 + n03) ** 2) +
      4 * n11 * (n30 + n12) * (n21 + n03),
    (3 * n21 - n03) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) -
      (n30 - 3 * n12) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2),
  ];
  return h.map((v) => Math.sign(v) * Math.log10(Math.abs(v) + 1e-30));
}

function profiles(mask: Uint8Array): number[] {
  const rows = new Array(GRID).fill(0);
  const cols = new Array(GRID).fill(0);
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (mask[y * GRID + x]) { rows[y]++; cols[x]++; }
  const v = [...rows, ...cols];
  const norm = Math.hypot(...v);
  return norm ? v.map((n) => n / norm) : v;
}

function aspect(mask: Uint8Array): number {
  let minX = GRID, minY = GRID, maxX = -1, maxY = -1;
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (mask[y * GRID + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  if (maxX < 0) return 1;
  return (maxX - minX + 1) / (maxY - minY + 1);
}

function staticScore(a: Uint8Array, b: Uint8Array) {
  const da = dilate(a), db = dilate(b);
  let inter = 0, union = 0;
  for (let i = 0; i < da.length; i++) {
    if (da[i] && db[i]) inter++;
    if (da[i] || db[i]) union++;
  }
  const iou = union ? inter / union : 0;

  const ha = huMoments(a), hb = huMoments(b);
  const huDist = Math.hypot(...ha.map((v, i) => v - hb[i]));
  const huSim = Math.exp(-huDist / 6);

  const pa = profiles(a), pb = profiles(b);
  const prof = pa.reduce((acc, v, i) => acc + v * pb[i], 0);

  const aa = aspect(a), ab = aspect(b);
  const asp = Math.min(aa, ab) / Math.max(aa, ab);

  const score = 0.45 * iou + 0.2 * huSim + 0.25 * prof + 0.1 * asp;
  return { score, detail: { iou, huSim, prof, asp } };
}

// ─────────────────────────── Lapis dinamis ───────────────────────────

function resample(strokes?: Stroke[] | null): number[][] | null {
  const pts: number[][] = [];
  for (const s of strokes ?? []) for (const p of s.points ?? []) pts.push([p.x, p.y]);
  if (pts.length < 4) return null;

  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const centred = pts.map(([x, y]) => [x - mx, y - my]);
  const scale = Math.max(...centred.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
  if (!scale) return null;
  const norm = centred.map(([x, y]) => [x / scale, y / scale]);

  const cum = [0];
  for (let i = 1; i < norm.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(norm[i][0] - norm[i - 1][0],
                                     norm[i][1] - norm[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (!total) return null;

  const out: number[][] = [];
  for (let k = 0; k < RESAMPLE_N; k++) {
    const target = (total * k) / (RESAMPLE_N - 1);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const span = cum[i] - cum[i - 1] || 1;
    const f = (target - cum[i - 1]) / span;
    out.push([
      norm[i - 1][0] + f * (norm[i][0] - norm[i - 1][0]),
      norm[i - 1][1] + f * (norm[i][1] - norm[i - 1][1]),
    ]);
  }
  return out;
}

function dtw(a: number[][], b: number[][]): number {
  const n = a.length, m = b.length;
  let prev = new Float64Array(m + 1).fill(Infinity);
  let curr = new Float64Array(m + 1).fill(Infinity);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr[0] = Infinity;
    for (let j = 1; j <= m; j++) {
      const d = Math.hypot(a[i - 1][0] - b[j - 1][0], a[i - 1][1] - b[j - 1][1]);
      curr[j] = d + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m] / (n + m);
}

// ─────────────────────────── API modul ───────────────────────────

export function compare(
  candidatePng: string, candidateStrokes: Stroke[] | null | undefined,
  referencePng: string, referenceStrokes: Stroke[] | null | undefined,
): MatchResult {
  const a = normalise(candidatePng);
  const b = normalise(referencePng);
  const stat = staticScore(a, b);

  const ra = resample(candidateStrokes);
  const rb = resample(referenceStrokes);
  const layers = ["static"];
  let dyn: number | null = null;
  if (ra && rb) {
    dyn = Math.exp(-dtw(ra, rb) * 3);
    layers.push("dynamic");
  }

  const combined = dyn === null ? stat.score : 0.6 * stat.score + 0.4 * dyn;
  const score = Math.round(Math.max(0, Math.min(1, combined)) * 100);

  const guidance: string[] = [];
  const d = stat.detail;
  if (d.iou < 0.35) guidance.push("Perbesar goresan sampai memenuhi kotak tanda tangan.");
  if (d.asp < 0.7) guidance.push("Jaga proporsi lebar dan tinggi seperti biasanya.");
  if (dyn === null) {
    guidance.push("Gunakan layar sentuh atau stylus agar irama goresan ikut terbaca.");
  } else if (dyn < 0.4) {
    guidance.push("Perlambat, jangan tergesa. Irama goresan ikut dinilai.");
  }

  return {
    score, layersUsed: layers,
    detail: { staticScore: stat.score, dynamicScore: dyn, ...stat.detail },
    guidance,
  };
}

export type Specimen = { image_png: string; strokes?: Stroke[] | null };

/**
 * Bandingkan dengan seluruh spesimen baseline; ambil skor terbaik.
 *
 * Memakai yang terbaik, bukan rata-rata: variasi wajar antar-spesimen tidak
 * seharusnya menghukum tanda tangan yang cocok dengan salah satunya.
 */
export function compareToSet(
  candidatePng: string, candidateStrokes: Stroke[] | null | undefined,
  specimens: Specimen[],
): MatchResult {
  let best: MatchResult | null = null;
  for (const s of specimens) {
    const r = compare(candidatePng, candidateStrokes, s.image_png, s.strokes);
    if (!best || r.score > best.score) best = r;
  }
  return best ?? {
    score: 0, layersUsed: [], detail: {},
    guidance: ["Belum ada spesimen terdaftar."],
  };
}

export function consistency(specimens: Specimen[]): number {
  if (specimens.length < 2) return 100;
  const scores: number[] = [];
  for (let i = 0; i < specimens.length; i++)
    for (let j = i + 1; j < specimens.length; j++)
      scores.push(compare(specimens[i].image_png, specimens[i].strokes,
                          specimens[j].image_png, specimens[j].strokes).score);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
