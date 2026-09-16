/**
 * Pembacaan dan impor Laporan Penerimaan Customer.
 *
 * Angka penerimaan menentukan dua hal sekaligus: prasyarat Cash Reward (DP atau
 * angsuran pertama sudah diterima) dan besaran Komisi, yang dihitung dari
 * persentase pembayaran. Laporan Penjualan tidak memuatnya — ia berhenti pada
 * nilai kontrak — sehingga selama ini angka itu hanya dapat diketik satu per
 * satu, padahal ia berubah tiap bulan untuk puluhan unit sekaligus.
 *
 * Bentuk berkasnya sama dengan Laporan Penjualan: berekstensi .xls tetapi isinya
 * TSV hasil ekspor. Bedanya ia satu tabel, bukan tiga seksi, dan kepalanya dua
 * baris — "Rencana Posisi Penerimaan" membentang di atas empat kolom yang nama
 * sebenarnya ada di baris kedua.
 *
 * Yang diambil adalah kolom "s/d Bulan Ini": penerimaan kumulatif sampai
 * tanggal laporan. "Bulan Berjalan" hanya penambahan bulan itu, dan memakainya
 * akan menihilkan pembayaran yang sudah masuk bulan-bulan sebelumnya.
 */

import type { PoolClient } from "pg";

import { audit, one, query } from "./db";

export type BarisPenerimaan = {
  unit: string; kontrak: string | null; customer: string;
  nilai_kontrak: number; persen: string;
  sampai_bulan_ini: number; sisa: number;
};

/**
 * Angka laporan, termasuk yang berdesimal.
 *
 * Nilai kontrak ditulis "3422000000.0000". Membuang seluruh karakter bukan
 * angka — cara yang dipakai Laporan Penjualan, yang memang bilangan bulat —
 * akan membacanya sebagai 34.220.000.000.000. Pemisah ribuan tetap dibuang.
 */
export function angkaDesimal(v: string): number {
  const s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  // Titik atau koma terakhir adalah pemisah desimal hanya bila diikuti 1–4
  // angka dan bukan kelompok ribuan tiga digit yang diikuti pemisah lain.
  const bersih = s.replace(/,/g, "");
  const n = Number(bersih);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Baca berkas laporan menjadi baris-baris penerimaan.
 *
 * Kepala tabel dicari lewat isinya, bukan lewat nomor barisnya: berkasnya
 * diawali judul dan tanggal cetak yang jumlah barisnya dapat berubah antar
 * versi, dan mengandalkan "baris ke-6" berarti impor diam-diam salah kolom
 * begitu sistem penjualannya menambah satu baris keterangan.
 */
export function bacaPenerimaan(teks: string): BarisPenerimaan[] {
  const lines = teks.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const iHdr = lines.findIndex((l) => {
    const c = l.split("\t").map((x) => x.trim().toLowerCase());
    return c.includes("no unit") && c.some((x) => x.startsWith("nilai kontrak"));
  });
  if (iHdr < 0) {
    throw new Error(
      "Kepala tabel tidak ditemukan. Pastikan berkasnya adalah Laporan " +
      "Penerimaan Customer hasil ekspor, bukan berkas lain.");
  }

  // Kepala dua baris: nama sebenarnya ada di baris kedua untuk kolom yang
  // bernaung di bawah "Rencana Posisi Penerimaan", dan di baris pertama untuk
  // sisanya.
  const atas = lines[iHdr].split("\t").map((x) => x.trim());
  const bawah = (lines[iHdr + 1] ?? "").split("\t").map((x) => x.trim());
  const nama = atas.map((a, i) => (bawah[i] || a).toLowerCase());

  const kolom = (cari: string) =>
    nama.findIndex((n) => n.startsWith(cari.toLowerCase()));

  const kUnit = kolom("no unit");
  const kKontrak = kolom("no.kontrak");
  const kCustomer = kolom("customer");
  const kNilai = kolom("nilai kontrak");
  const kPersen = kolom("presentase lunas");
  const kSampai = nama.findIndex((n) => /^s\/d bulan ini/.test(n));
  const kSisa = kolom("sisa tagihan");

  if (kUnit < 0 || kSampai < 0) {
    throw new Error(
      "Kolom 'No Unit' atau 's/d Bulan Ini' tidak ditemukan pada kepala tabel.");
  }

  const hasil: BarisPenerimaan[] = [];
  for (let i = iHdr + 2; i < lines.length; i++) {
    const c = lines[i].split("\t").map((x) => x.trim());
    // Baris data selalu dimulai nomor urut; TOTAL dan baris kosong berhenti.
    if (!/^\d+$/.test(c[0])) continue;
    const unit = c[kUnit] ?? "";
    if (!unit) continue;
    hasil.push({
      unit,
      kontrak: (kKontrak >= 0 ? c[kKontrak] : "") || null,
      customer: (kCustomer >= 0 ? c[kCustomer] : "") || "",
      nilai_kontrak: kNilai >= 0 ? angkaDesimal(c[kNilai]) : 0,
      persen: (kPersen >= 0 ? c[kPersen] : "") || "",
      sampai_bulan_ini: angkaDesimal(c[kSampai]),
      sisa: kSisa >= 0 ? angkaDesimal(c[kSisa]) : 0,
    });
  }
  return hasil;
}

export type HasilPenerimaan = {
  baris: number;
  diperbarui: number;
  sama: number;
  tak_dikenal: number;
  ganda: number;
  dry_run: boolean;
  pratinjau: {
    unit: string; kontrak: string | null; customer: string;
    sebelum: number | null; sesudah: number; persen: string; tindakan: string;
  }[];
  catatan: string[];
};

/**
 * Impor penerimaan ke kolom received_amount.
 *
 * Pencocokannya bertingkat: nomor kontrak lebih dulu, kode unit belakangan.
 * Satu kode unit dapat menyandang dua penjualan — pembelinya batal lalu unitnya
 * dijual lagi — dan penerimaan penjualan kedua bukan milik penjualan pertama.
 * Bila kode unitnya menunjuk lebih dari satu penjualan yang masih hidup, barisnya
 * dilewati dan dilaporkan, bukan ditebak.
 */
export async function imporPenerimaan(
  teks: string,
  opsi: { dryRun?: boolean; aktor?: string; namaBerkas?: string } = {},
  client?: PoolClient,
): Promise<HasilPenerimaan> {
  const dryRun = Boolean(opsi.dryRun);
  const baris = bacaPenerimaan(teks);

  let diperbarui = 0, sama = 0, tak_dikenal = 0, ganda = 0;
  const pratinjau: HasilPenerimaan["pratinjau"] = [];

  for (const b of baris) {
    let unit = b.kontrak
      ? await one<any>(
          "SELECT id, code, received_amount FROM units WHERE contract_number=$1",
          [b.kontrak], client)
      : null;

    if (!unit) {
      // Penjualan yang batal tidak dikeluarkan dari pencarian: penerimaannya
      // sungguh ada — biasanya menunggu dikembalikan — dan menyembunyikannya
      // membuat baris itu dilaporkan "tak dikenal", padahal unitnya dikenal.
      // Yang masih hidup tetap didahulukan bila kodenya menyandang dua
      // penjualan sekaligus.
      const semua = await query<any>(
        `SELECT id, code, received_amount, status FROM units WHERE code=$1`,
        [b.unit], client);
      const hidup = semua.filter((u) => u.status !== "cancelled");
      const cocok = semua.length === 1 ? semua : hidup;
      if (cocok.length > 1) {
        ganda++;
        pratinjau.push({
          unit: b.unit, kontrak: b.kontrak, customer: b.customer,
          sebelum: null, sesudah: b.sampai_bulan_ini, persen: b.persen,
          tindakan: "ganda",
        });
        continue;
      }
      unit = cocok[0] ?? null;
    }

    if (!unit) {
      tak_dikenal++;
      pratinjau.push({
        unit: b.unit, kontrak: b.kontrak, customer: b.customer,
        sebelum: null, sesudah: b.sampai_bulan_ini, persen: b.persen,
        tindakan: "tak dikenal",
      });
      continue;
    }

    const sebelum = Number(unit.received_amount ?? 0);
    if (sebelum === b.sampai_bulan_ini) {
      sama++;
      pratinjau.push({
        unit: unit.code, kontrak: b.kontrak, customer: b.customer,
        sebelum, sesudah: b.sampai_bulan_ini, persen: b.persen,
        tindakan: "tidak berubah",
      });
      continue;
    }

    if (!dryRun) {
      await query("UPDATE units SET received_amount=$2 WHERE id=$1",
                  [unit.id, b.sampai_bulan_ini], client);
    }
    diperbarui++;
    pratinjau.push({
      unit: unit.code, kontrak: b.kontrak, customer: b.customer,
      sebelum, sesudah: b.sampai_bulan_ini, persen: b.persen,
      tindakan: "diperbarui",
    });
  }

  if (!dryRun) {
    await audit({
      entityType: "unit", action: "import_receipts",
      actor: opsi.aktor ?? "cli",
      after: { file: opsi.namaBerkas ?? null, baris: baris.length, diperbarui },
      reason: `Impor Laporan Penerimaan: ${diperbarui} unit diperbarui dari ` +
              `${baris.length} baris.`,
    }, client);
  }

  return {
    baris: baris.length, diperbarui, sama, tak_dikenal, ganda, dry_run: dryRun,
    pratinjau,
    catatan: [
      "Yang diambil adalah kolom 's/d Bulan Ini' — penerimaan kumulatif sampai " +
      "tanggal laporan, bukan penambahan bulan berjalan saja.",
      "Angka yang sempat diketik tangan lewat 'Catat dokumen' ikut tertimpa: " +
      "laporan inilah sumber yang berlaku.",
      "Prasyarat pencairan (SPU, PPJB, DP, Sign P3U) tidak ada di laporan ini " +
      "dan tidak diubah oleh impor.",
    ],
  };
}
