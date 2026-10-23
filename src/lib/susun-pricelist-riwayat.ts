/**
 * Riwayat perubahan penyusunan pricelist: siapa, kapan, dan apa yang diubah.
 *
 * Setiap Simpan draf dicatat dengan daftar perubahan yang dapat dibaca orang
 * (mis. "Unit NS-NR1-01: Land 146,5 → 150"), dihitung dengan membandingkan
 * draf lama dan baru. Memberlakukan, mengganti nama, dan menghapus pricelist
 * juga dicatat di sini supaya seluruh jejaknya ada di satu daftar.
 */

import { query } from "./db";
import {
  FAKTOR, labelPpn, namaTahap, tarifPpn,
  type SkemaIrr, type SusunPricelist, type UnitData,
} from "./susun-pricelist";

let sekali: Promise<void> | null = null;
function ensureTabel(): Promise<void> {
  sekali ??= query(`
    CREATE TABLE IF NOT EXISTS pricelist_susun_riwayat (
      id         BIGSERIAL PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id),
      oleh       TEXT NOT NULL,
      pada       TIMESTAMPTZ NOT NULL DEFAULT now(),
      aksi       TEXT NOT NULL,
      perubahan  JSONB NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS pricelist_susun_riwayat_project
      ON pricelist_susun_riwayat (project_id, pada DESC)`)
    .then(() => undefined).catch((e) => { sekali = null; throw e; });
  return sekali;
}

export type BarisRiwayat = {
  id: string; oleh: string; pada: string; aksi: string; perubahan: string[];
};

export async function catatRiwayat(
  projectId: string, oleh: string, aksi: string, perubahan: string[],
): Promise<void> {
  await ensureTabel();
  await query(
    `INSERT INTO pricelist_susun_riwayat (project_id, oleh, aksi, perubahan)
     VALUES ($1,$2,$3,$4)`,
    [projectId, oleh, aksi, JSON.stringify(perubahan)]);
}

export async function bacaRiwayat(projectId: string, batas = 2000): Promise<BarisRiwayat[]> {
  await ensureTabel();
  return query<BarisRiwayat>(
    `SELECT id::text, oleh, pada, aksi, perubahan FROM pricelist_susun_riwayat
     WHERE project_id=$1 ORDER BY pada DESC, id DESC LIMIT $2`,
    [projectId, batas]);
}

// ── Membandingkan dua draf ────────────────────────────────────────────────

const angka = (n: number, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("id-ID", { maximumFractionDigits: d }) : "—";
const persen = (n: number) => `${angka(n * 100, 4)}%`;
const teks = (s: string | undefined) => (s ?? "").trim() ? `"${(s ?? "").trim()}"` : "(kosong)";

/**
 * Sama isinya, tanpa peduli urutan kunci atau kunci yang bernilai undefined
 * (isian dari layar dan dari basis data dapat berbeda urutan).
 */
const urut = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(urut)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort()
          .filter((k) => (v as any)[k] !== undefined).map((k) => [k, urut((v as any)[k])]))
      : v;
const sama = (a: unknown, b: unknown) => JSON.stringify(urut(a)) === JSON.stringify(urut(b));

/** Paling banyak sekian baris per catatan; sisanya diringkas. */
const BATAS_BARIS = 60;

/**
 * Daftar perubahan dari draf `lama` ke `baru`, dalam kalimat pendek.
 * `lama` null berarti draf pertama.
 */
export function bedaSusun(lama: SusunPricelist | null, baru: SusunPricelist): string[] {
  if (!lama) return [`Draf pertama disimpan (${baru.unit.length} unit, ${baru.irr.skema.length} cara bayar).`];
  const out: string[] = [];
  const nilai = (label: string, a: string, b: string) => { if (a !== b) out.push(`${label}: ${a} → ${b}`); };

  // Umum
  nilai("Tarif PPN", labelPpn(tarifPpn(lama)), labelPpn(tarifPpn(baru)));

  // 1. Data (IRR)
  const [ia, ib] = [lama.irr, baru.irr];
  nilai("Data (IRR) · Target interest rate", persen(ia.target), persen(ib.target));
  nilai("Data (IRR) · Cash Price", angka(ia.hargaKas ?? NaN, 0), angka(ib.hargaKas ?? NaN, 0));
  const ta = namaTahap(ia), tb = namaTahap(ib);
  tb.forEach((n, i) => {
    nilai(`Data (IRR) · Porsi ${n}`, persen(ia.porsiTahap[i]), persen(ib.porsiTahap[i]));
    nilai(`Data (IRR) · Nama tahap ${i + 1}`, teks(ta[i]), teks(n));
  });
  const skA = new Map(ia.skema.map((s) => [s.nama, s]));
  const skB = new Map(ib.skema.map((s) => [s.nama, s]));
  const tambah = ib.skema.filter((s) => !skA.has(s.nama)).map((s) => s.nama);
  const hapus = ia.skema.filter((s) => !skB.has(s.nama)).map((s) => s.nama);
  if (tambah.length) out.push(`Data (IRR) · Cara bayar ditambah: ${tambah.join(", ")}`);
  if (hapus.length) out.push(`Data (IRR) · Cara bayar dihapus: ${hapus.join(", ")}`);
  for (const b of ib.skema) {
    const a = skA.get(b.nama);
    if (!a) continue;
    const p = `Data (IRR) · ${b.nama}`;
    const kolom: [string, (s: SkemaIrr) => string][] = [
      ["Kelompok", (s) => teks(s.kelompok)], ["Allocation", (s) => persen(s.alokasi)],
      ["DP", (s) => persen(s.dp)], ["Installments", (s) => angka(s.kali)],
      ...tb.map((n, i) => [`Bulan ${n}`, (s: SkemaIrr) => angka(s.bulan[i])] as [string, (s: SkemaIrr) => string]),
    ];
    for (const [l, f] of kolom) nilai(`${p} · ${l}`, f(a), f(b));
  }

  // 2. Unit Data
  const uA = new Map(lama.unit.map((u) => [u.kode, u]));
  const uB = new Map(baru.unit.map((u) => [u.kode, u]));
  const uTambah = baru.unit.filter((u) => !uA.has(u.kode)).map((u) => u.kode || "(tanpa code)");
  const uHapus = lama.unit.filter((u) => !uB.has(u.kode)).map((u) => u.kode || "(tanpa code)");
  if (uTambah.length) out.push(`Unit Data · Unit ditambah (${uTambah.length}): ${uTambah.join(", ")}`);
  if (uHapus.length) out.push(`Unit Data · Unit dihapus (${uHapus.length}): ${uHapus.join(", ")}`);
  const lp = labelPpn(tarifPpn(baru));
  const KOLOM_UNIT: [string, (u: UnitData) => string][] = [
    ["Address", (u) => teks(u.alamat)], ["View", (u) => teks(u.view)], ["No", (u) => teks(u.no)],
    ["Ukuran", (u) => teks(u.ukuran)], ["Phase", (u) => teks(u.phase)], ["Tipe PL", (u) => teks(u.tipe)],
    ["Type", (u) => teks(u.tipeBangunan)], ["View (sesudah Type)", (u) => teks(u.view2)],
    ["Sub-Tipe Kavling/Irr/Irr Hoek", (u) => teks(u.bentuk)], ["Sub-Tipe", (u) => teks(u.subTipe)],
    ["Land", (u) => angka(u.lt)], [`Land Price (base) (Excl PPN. ${lp})`, (u) => angka(u.hargaTanah, 0)],
    ["GFA", (u) => angka(u.lb)], [`GFA (base) (Excl PPN. ${lp})`, (u) => angka(u.hargaBangunan, 0)],
    ["Increase", (u) => persen(u.kenaikan)], ["Catatan Kenaikan", (u) => teks(u.kenaikanCatatan)],
    ...FAKTOR.map(([k, l]) => [l, (u: UnitData) => persen(u.faktor[k] ?? 0)] as [string, (u: UnitData) => string]),
    ["(+) Factor", (u) => persen(u.faktorTambah)], ["(+) Factor (Rp)", (u) => angka(u.faktorTambahRp ?? 0, 0)],
    ["(−) Faktor", (u) => persen(u.faktorKurang ?? 0)], ["(−) Faktor (Rp)", (u) => angka(u.faktorKurangRp ?? 0, 0)], ["Special", (u) => angka(u.special, 0)],
    ["Show Unit", (u) => angka(u.showUnit, 0)],
    ["Floor", (u) => angka(u.floor ?? 0)], ["Biaya AJB + BPHTB", (u) => persen(u.biayaAjb ?? 0)],
    ["Special %", (u) => persen(u.specialPersen ?? 0)],
    ["Pembagi Harga Dasar (Termasuk PPN)", (u) => angka(u.pembagiIncl ?? 1, 4)],
    ["Penyesuaian (%)", (u) => persen(u.penyesuaian ?? 0)], ["Penyesuaian (Rp)", (u) => angka(u.penyesuaianRp ?? 0, 0)],
  ];
  for (const b of baru.unit) {
    const a = uA.get(b.kode);
    if (!a) continue;
    const beda = KOLOM_UNIT.filter(([, f]) => f(a) !== f(b)).map(([l, f]) => `${l} ${f(a)} → ${f(b)}`);
    if (beda.length) out.push(`Unit Data · ${b.kode}: ${beda.join("; ")}`);
  }
  if ((lama.catatanUnit ?? "") !== (baru.catatanUnit ?? "")) out.push("Unit Data · Catatan diubah");
  const gA = new Set((lama.catatanGambar ?? []).map((g) => g.id));
  const gB = new Set((baru.catatanGambar ?? []).map((g) => g.id));
  const gTambah = (baru.catatanGambar ?? []).filter((g) => !gA.has(g.id)).map((g) => g.nama);
  const gHapus = (lama.catatanGambar ?? []).filter((g) => !gB.has(g.id)).map((g) => g.nama);
  if (gTambah.length) out.push(`Unit Data · Gambar catatan ditambah: ${gTambah.join(", ")}`);
  if (gHapus.length) out.push(`Unit Data · Gambar catatan dihapus: ${gHapus.join(", ")}`);

  // 3. Data Pricelist
  nilai("Data Pricelist · Tambahan per unit", angka(lama.dataPricelist.tambahan, 0),
        angka(baru.dataPricelist.tambahan, 0));
  if (!sama(lama.dataPricelist.kolom, baru.dataPricelist.kolom)) {
    out.push(`Data Pricelist · Susunan kolom diubah (${baru.dataPricelist.kolom.map((k) => k.nama).join(", ")})`);
  }

  // 4. Pricelist
  const [pa, pb] = [lama.pricelist, baru.pricelist];
  nilai("Pricelist · Judul", teks(pa.judul), teks(pb.judul));
  nilai("Pricelist · Tanggal", teks(pa.tanggal), teks(pb.tanggal));
  if (pa.catatan !== pb.catatan) out.push("Pricelist · Catatan diubah");
  nilai("Pricelist · Pagu PPN DTP", angka(pa.batasDtp, 0), angka(pb.batasDtp, 0));
  if (!sama(pa.kolom, pb.kolom)) {
    out.push(`Pricelist · Susunan kolom harga diubah (${pb.kolom.map((k) => k.nama).join(", ")})`);
  }

  // 5. Terms & Conditions
  if (!sama(lama.tnc, baru.tnc)) out.push("Terms & Conditions diubah");

  if (out.length > BATAS_BARIS) {
    return [...out.slice(0, BATAS_BARIS), `… dan ${out.length - BATAS_BARIS} perubahan lain`];
  }
  return out;
}
