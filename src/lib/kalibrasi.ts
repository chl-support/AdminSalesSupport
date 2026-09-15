/**
 * Kalibrasi ambang tanda tangan (PRD 12.2).
 *
 * Ambang 75 yang terpasang berasal dari PRD sebagai angka sementara, bukan hasil
 * pengukuran. Skor kemiripan tidak punya makna universal: 75 pada mesin ini tidak
 * setara 75 pada mesin lain, dan tidak ada cara mengetahui apakah 75 terlalu ketat
 * atau terlalu longgar selain mengukurnya pada tanda tangan sungguhan.
 *
 * Modul ini yang mengukurnya. Ia menyusun dua kelompok skor dari spesimen yang
 * tersimpan:
 *
 *   asli   — pasangan spesimen milik orang yang sama. Sebaran inilah yang
 *            menentukan False Reject Rate: berapa sering tanda tangan sah ditolak.
 *   tiruan — pasangan spesimen milik dua orang berbeda. Sebaran inilah yang
 *            menentukan False Accept Rate.
 *
 * SATU BATAS YANG TIDAK BOLEH DILUPAKAN. Kelompok "tiruan" di sini adalah
 * pemalsu tanpa usaha (zero-effort): tanda tangan orang lain yang kebetulan
 * dibandingkan, bukan orang yang sengaja meniru tanda tangan si agent setelah
 * melihatnya. Pemalsu sungguhan selalu mencetak skor lebih tinggi. Artinya FAR
 * yang dihitung di sini adalah batas bawah — kenyataannya lebih buruk, dan
 * seberapa buruk hanya dapat diketahui dengan percobaan peniruan sungguhan
 * sebagaimana diminta PRD 12.2. Angka dari modul ini boleh dipakai untuk
 * menyetel, tidak untuk menyatakan sistemnya sudah terbukti aman.
 */

import { query } from "./db";
import { compare, type Stroke } from "./signature";

/** Syarat data menurut PRD 12.2. */
export const SYARAT = {
  orang: 30,
  spesimenPerOrang: 10,
  /** Percobaan peniruan sungguhan — belum ada jalurnya di sistem ini. */
  peniruanSungguhan: true,
};

type Spesimen = {
  marketing_id: string; nama: string;
  image_png: string; strokes: Stroke[] | null;
  dari_pendaftaran: boolean;
};

export type Sebaran = {
  n: number; min: number; p05: number; median: number; p95: number;
  max: number; rata: number;
};

export type TitikAmbang = {
  ambang: number;
  /** Bagian tanda tangan sah yang akan ditolak, dalam persen. */
  frr: number;
  /** Bagian tanda tangan orang lain yang akan diterima, dalam persen. */
  far: number;
};

export type HasilKalibrasi = {
  bahan: {
    orang: number; spesimen: number;
    pasangan_asli: number; pasangan_tiruan: number;
    /** Spesimen yang benar-benar direkam orang lewat layar pendaftaran. */
    dari_pendaftaran: number;
    dipotong_batas: boolean; sumber_sintetis: boolean;
    detik: number;
  };
  sebaran: { asli: Sebaran | null; tiruan: Sebaran | null };
  kurva: TitikAmbang[];
  usul: {
    eer: number | null;
    /** Ambang terendah yang membuat FAR 0 pada data ini. */
    far_nol: number | null;
    /** Ambang tertinggi yang membuat FRR ≤ 5%. */
    frr_5: number | null;
    /** Yang disarankan dipasang, bila datanya cukup untuk menyarankan apa pun. */
    ambang: number | null;
  };
  protokol: {
    terpenuhi: boolean;
    kekurangan: string[];
  };
};

function sebaran(skor: number[]): Sebaran | null {
  if (!skor.length) return null;
  const s = [...skor].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return {
    n: s.length, min: s[0], max: s[s.length - 1],
    p05: at(0.05), median: at(0.5), p95: at(0.95),
    rata: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10,
  };
}

/**
 * Acak yang dapat diulang.
 *
 * Pengambilan sampel pasangan harus memberi hasil yang sama bila dijalankan lagi
 * atas data yang sama — kalau tidak, dua kali kalibrasi menghasilkan dua ambang
 * berbeda tanpa ada yang berubah, dan tidak ada yang tahu mana yang benar.
 */
function acakTertata(n: number, benih = 12345) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = benih;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export async function kalibrasi(
  opsi: { batasPasangan?: number; batasDetik?: number } = {},
): Promise<HasilKalibrasi> {
  const batasPasangan = opsi.batasPasangan ?? 1500;
  const batasDetik = opsi.batasDetik ?? 8;
  const mulai = Date.now();

  const spesimen = await query<Spesimen>(
    `SELECT s.marketing_id, m.full_name AS nama, s.image_png, s.strokes,
            (e.token IS NOT NULL) AS dari_pendaftaran
       FROM signature_specimens s
       JOIN marketings m ON m.id = s.marketing_id
       LEFT JOIN enrollment_sessions e ON e.set_id = s.set_id
      WHERE NOT s.archived
      ORDER BY s.marketing_id, s.sequence`);

  const perOrang = new Map<string, Spesimen[]>();
  for (const sp of spesimen) {
    const list = perOrang.get(sp.marketing_id) ?? [];
    list.push(sp);
    perOrang.set(sp.marketing_id, list);
  }

  // Susun daftar pasangan dulu, baru skornya dihitung. Membandingkan seluruh
  // kombinasi pada 50 agent × 10 spesimen berarti 124.750 perbandingan — jauh di
  // atas batas waktu satu permintaan, dan hasilnya tidak lebih tajam daripada
  // sampel beberapa ribu.
  const asliPas: [Spesimen, Spesimen][] = [];
  for (const list of perOrang.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) asliPas.push([list[i], list[j]]);
  }
  const tiruanPas: [Spesimen, Spesimen][] = [];
  for (let i = 0; i < spesimen.length; i++)
    for (let j = i + 1; j < spesimen.length; j++)
      if (spesimen[i].marketing_id !== spesimen[j].marketing_id)
        tiruanPas.push([spesimen[i], spesimen[j]]);

  let dipotong = false;
  const ambil = (pas: [Spesimen, Spesimen][]) => {
    if (pas.length <= batasPasangan) return pas;
    dipotong = true;
    return acakTertata(pas.length).slice(0, batasPasangan).map((i) => pas[i]);
  };

  const skorAsli: number[] = [];
  const skorTiruan: number[] = [];
  const habis = () => (Date.now() - mulai) / 1000 > batasDetik;

  for (const [a, b] of ambil(asliPas)) {
    if (habis()) { dipotong = true; break; }
    skorAsli.push(compare(a.image_png, a.strokes, b.image_png, b.strokes).score);
  }
  for (const [a, b] of ambil(tiruanPas)) {
    if (habis()) { dipotong = true; break; }
    skorTiruan.push(compare(a.image_png, a.strokes, b.image_png, b.strokes).score);
  }

  // Ambang diuji sebagaimana dipakai mesinnya: diterima bila skor ≥ ambang.
  const kurva: TitikAmbang[] = [];
  for (let t = 0; t <= 100; t++) {
    const frr = skorAsli.length
      ? (skorAsli.filter((s) => s < t).length / skorAsli.length) * 100 : NaN;
    const far = skorTiruan.length
      ? (skorTiruan.filter((s) => s >= t).length / skorTiruan.length) * 100 : NaN;
    kurva.push({ ambang: t, frr: Math.round(frr * 10) / 10,
                 far: Math.round(far * 10) / 10 });
  }

  const cukup = skorAsli.length > 0 && skorTiruan.length > 0;
  const eer = cukup
    ? kurva.reduce((best, p) =>
        Math.abs(p.far - p.frr) < Math.abs(best.far - best.frr) ? p : best).ambang
    : null;
  const farNol = cukup ? (kurva.find((p) => p.far === 0)?.ambang ?? null) : null;
  const frr5 = cukup
    ? ([...kurva].reverse().find((p) => p.frr <= 5)?.ambang ?? null) : null;

  // Yang membedakan spesimen sungguhan dari spesimen buatan bukan namanya,
  // melainkan asalnya: tanda tangan yang direkam orang lewat layar pendaftaran
  // punya sesi pendaftaran, tanda tangan yang dibangkitkan saat penyiapan tidak.
  // Menebak dari nama akan salah dua arah sekaligus — agent sungguhan yang
  // kebetulan bernama sama dengan data contoh, dan data contoh yang namanya
  // diganti.
  const dariPendaftaran = spesimen.filter((s) => s.dari_pendaftaran).length;
  const sintetis = spesimen.length > 0 && dariPendaftaran === 0;

  const kekurangan: string[] = [];
  if (perOrang.size < SYARAT.orang) {
    kekurangan.push(
      `Baru ${perOrang.size} orang punya spesimen; protokol meminta ` +
      `${SYARAT.orang}–50 agent.`);
  }
  const minSpesimen = perOrang.size
    ? Math.min(...[...perOrang.values()].map((l) => l.length)) : 0;
  if (minSpesimen < SYARAT.spesimenPerOrang) {
    kekurangan.push(
      `Spesimen paling sedikit ${minSpesimen} per orang; protokol meminta ` +
      `${SYARAT.spesimenPerOrang} tanda tangan asli per orang.`);
  }
  if (dariPendaftaran < spesimen.length) {
    kekurangan.push(
      `${spesimen.length - dariPendaftaran} dari ${spesimen.length} spesimen ` +
      "bukan berasal dari layar pendaftaran — kemungkinan besar data contoh " +
      "yang dibangkitkan saat penyiapan.");
  }
  kekurangan.push(
    "Kelompok pembanding berisi tanda tangan orang lain, bukan percobaan " +
    "peniruan sungguhan. FAR di bawah ini batas bawah — pemalsu yang pernah " +
    "melihat tanda tangan aslinya akan mencetak skor lebih tinggi.");


  return {
    bahan: {
      orang: perOrang.size, spesimen: spesimen.length,
      pasangan_asli: skorAsli.length, pasangan_tiruan: skorTiruan.length,
      dari_pendaftaran: dariPendaftaran,
      dipotong_batas: dipotong, sumber_sintetis: sintetis,
      detik: Math.round((Date.now() - mulai) / 100) / 10,
    },
    sebaran: { asli: sebaran(skorAsli), tiruan: sebaran(skorTiruan) },
    // Kurva dikirim setiap 5 angka saja; 101 baris tidak menolong siapa pun
    // membaca, dan yang penting (EER, FAR nol, FRR 5%) sudah dihitung terpisah.
    kurva: kurva.filter((p) => p.ambang % 5 === 0),
    usul: {
      eer, far_nol: farNol, frr_5: frr5,
      // Usulan condong ke sisi aman: ambang terendah yang belum menerima satu pun
      // tanda tangan orang lain, bukan titik setimbang EER. Tanda tangan sah yang
      // ditolak berujung pada pemeriksaan Admin — merepotkan, dapat diperbaiki.
      // Tanda tangan palsu yang diterima berujung pada uang yang sudah ditransfer.
      ambang: farNol,
    },
    protokol: { terpenuhi: false, kekurangan },
  };
}
