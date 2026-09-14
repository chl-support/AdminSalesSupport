/**
 * Pembacaan dan impor Laporan Penjualan.
 *
 * Berada di lib, bukan di scripts, karena dipakai dua pemanggil: menu unggah di
 * konsol dan skrip baris perintah. Dua salinan logika yang sama akan berbeda
 * cepat atau lambat, dan perbedaannya berupa data penjualan yang salah masuk —
 * bukan sesuatu yang ketahuan sebelum ada yang memeriksa angkanya.
 *
 * Berkas laporannya berekstensi .xls tetapi isinya TSV: ekspor dari sistem
 * penjualan, bukan workbook Excel. Dibaca sebagai teks bertab, bukan lewat
 * pustaka spreadsheet, karena memang bukan itu bentuknya.
 *
 * Tiga seksi: A. Summary Penjualan, B. Pembatalan Unit, C. Penjualan Netto.
 * Yang diimpor adalah A, lalu B dipakai menandai penjualan yang batal. C tidak
 * diimpor terpisah — ia hanya A dikurangi B, dan mengimpornya akan menghitung
 * penjualan yang sama dua kali.
 */

import type { PoolClient } from "pg";

import { audit, one, query } from "./db";

export type Baris = Record<string, string>;
export type Seksi = { seksi: string; hdr: string[]; rows: Baris[] };

// ───────────────────────── Pembacaan ─────────────────────────

export function bacaLaporan(teks: string): Seksi[] {
  const lines = teks.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const hasil: Seksi[] = [];
  let i = 0;
  while (i < lines.length) {
    // Judul seksi berbentuk "A. Summary Penjualan"; barisnya sendiri tidak
    // bertab isi, hanya tab kosong sebagai pengisi kolom.
    const judul = lines[i].split("\t")[0].trim();
    if (/^[A-Z]\.\s/.test(judul)) {
      const hdr = lines[i + 1]?.split("\t").map((h) => h.trim()) ?? [];
      const rows: Baris[] = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const c = lines[j].split("\t").map((x) => x.trim());
        // Baris data selalu dimulai nomor urut. TOTAL dan baris kosong berhenti.
        if (!/^\d+$/.test(c[0])) break;
        const r: Baris = {};
        hdr.forEach((h, k) => { if (h) r[h] = c[k] ?? ""; });
        rows.push(r);
      }
      hasil.push({ seksi: judul, hdr, rows });
      i = j;
    } else {
      i++;
    }
  }
  return hasil;
}

// ───────────────────────── Penormalan nilai ─────────────────────────

/** "3,422,000,000" → 3422000000. Kosong → 0. */
export const angka = (v: string) => {
  const n = Number(String(v ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Tanggal laporan, ke bentuk ISO.
 *
 * Laporannya tidak seragam: "01 February 2025" bercampur dengan "25-Sep-24"
 * pada kolom yang sama. Menangani satu bentuk saja membuat 22 dari 52 baris
 * kehilangan tanggal kontraknya — dan tanggal kontrak itulah yang memilih skema
 * insentif serta tarif pajak yang berlaku, jadi kerugiannya bukan kosmetik.
 *
 * Tahun dua digit dibaca sebagai 20xx: laporan ini bermula 2024, dan proyeknya
 * tidak punya kontrak abad lalu.
 */
const BULAN: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
export function tanggal(v: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{2}|\d{4})$/);
  if (!m) return null;
  const bl = BULAN[m[2].slice(0, 3).toLowerCase()];
  if (!bl) return null;
  const th = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${th}-${bl}-${m[1].padStart(2, "0")}`;
}

/**
 * "M. Rizky Maulana Nst / Linktown" → nama dan agensinya.
 *
 * Sales in-house ditulis tanpa garis miring. Pembedaan itulah yang menentukan
 * marketing_type, dan lewat itu tarif pajak yang berlaku — jadi bukan sekadar
 * kerapian tampilan.
 */
export function uraiNama(v: string): { nama: string; agensi: string | null } {
  const s = String(v ?? "").trim();
  if (!s) return { nama: "", agensi: null };
  const i = s.indexOf("/");
  if (i < 0) return { nama: s.replace(/\s+/g, " "), agensi: null };
  return {
    nama: s.slice(0, i).trim().replace(/\s+/g, " "),
    agensi: s.slice(i + 1).trim().replace(/\s+/g, " ") || null,
  };
}

// ───────────────────────── Impor ─────────────────────────

export type HasilImpor = {
  seksi: { nama: string; baris: number }[];
  baru: number;
  diperbarui: number;
  dilewati: number;
  marketing: number;
  dry_run: boolean;
  /** Pratinjau baris, untuk diperlihatkan sebelum ditulis. */
  pratinjau: {
    unit: string; kontrak: string | null; tanggal: string | null;
    status: string; nilai: number; sales: string; tindakan: string;
  }[];
  catatan: string[];
};

export async function imporLaporan(
  teks: string,
  opsi: { dryRun?: boolean; aktor?: string; namaBerkas?: string } = {},
  client?: PoolClient,
): Promise<HasilImpor> {
  const dryRun = Boolean(opsi.dryRun);
  const seksi = bacaLaporan(teks);
  const summary = seksi.find((s) => /Summary Penjualan/i.test(s.seksi));
  const batal = seksi.find((s) => /Pembatalan/i.test(s.seksi));
  if (!summary) {
    throw new Error(
      "Seksi 'A. Summary Penjualan' tidak ditemukan. Pastikan berkasnya adalah " +
      "Laporan Penjualan hasil ekspor, bukan berkas lain.");
  }

  // Pembatalan ditandai lewat nomor kontrak, bukan kode unit: unit yang sama
  // dapat punya penjualan batal dan penjualan berjalan sekaligus, dan menandai
  // keduanya batal akan menghapus penjualan yang justru masih hidup.
  const dibatalkan = new Set(
    (batal?.rows ?? []).map((r) => r["No.Kontrak"]).filter(Boolean));

  const cacheAgensi = new Map<string, string>();
  const cacheMarketing = new Map<string, string>();

  async function agensiId(nama: string): Promise<string> {
    const kunci = nama.toLowerCase();
    if (cacheAgensi.has(kunci)) return cacheAgensi.get(kunci)!;
    const ada = await one<{ id: string }>(
      "SELECT id FROM agencies WHERE lower(name) = $1", [kunci], client);
    const id = ada?.id ?? (await query<{ id: string }>(
      "INSERT INTO agencies (name) VALUES ($1) RETURNING id", [nama], client))[0].id;
    cacheAgensi.set(kunci, id);
    return id;
  }

  /**
   * Marketing dibuat berstatus 'draft', bukan 'active'.
   *
   * Status aktif menandakan pendaftaran dan perekaman spesimen tanda tangan
   * sudah selesai — sesuatu yang tidak dapat disimpulkan dari laporan penjualan.
   * Menandainya aktif hanya karena namanya muncul di laporan akan melewati
   * pemeriksaan yang menjaga agar pembayaran tidak keluar kepada orang yang
   * tanda tangannya belum pernah direkam.
   */
  async function marketingId(raw: string): Promise<string | null> {
    const { nama, agensi } = uraiNama(raw);
    if (!nama) return null;
    const kunci = nama.toLowerCase();
    if (cacheMarketing.has(kunci)) return cacheMarketing.get(kunci)!;
    const ada = await one<{ id: string }>(
      "SELECT id FROM marketings WHERE lower(full_name) = $1", [kunci], client);
    let id = ada?.id;
    if (!id) {
      id = (await query<{ id: string }>(
        `INSERT INTO marketings (full_name, marketing_type, agency_id,
           npwp_type, recipient_type, phone, status)
         VALUES ($1,$2,$3,'none',$4,'','draft') RETURNING id`,
        [nama, agensi ? "agent" : "inhouse",
         agensi ? await agensiId(agensi) : null,
         agensi ? "company" : "individual"], client))[0].id;
    }
    cacheMarketing.set(kunci, id);
    return id;
  }

  let baru = 0, diperbarui = 0, dilewati = 0;
  const pratinjau: HasilImpor["pratinjau"] = [];

  for (const r of summary.rows) {
    const code = r["Unit"];
    if (!code) { dilewati++; continue; }

    const nilai = angka(r["Nilai Kontrak (Include PPN)"]);
    const tglKontrak = tanggal(r["Tgl. Kontrak"]);
    const tglBatal = tanggal(r["Tgl Batal"]);
    const status = tglBatal || dibatalkan.has(r["No.Kontrak"])
      ? "cancelled" : "booked";

    // Dicocokkan lewat nomor kontrak, bukan kode unit.
    //
    // Satu unit dapat terjual lebih dari sekali: pembelinya batal, unitnya
    // dijual lagi. Mengunci pada kode unit membuat penjualan yang lebih baru
    // menimpa yang lama tanpa jejak — padahal klaim melekat pada penjualannya,
    // bukan pada batu batanya.
    const noKontrak = r["No.Kontrak"] || null;
    const ada = noKontrak
      ? await one<{ id: string }>(
          "SELECT id FROM units WHERE contract_number = $1", [noKontrak], client)
      : await one<{ id: string }>(
          "SELECT id FROM units WHERE code = $1 AND contract_number IS NULL",
          [code], client);

    pratinjau.push({
      unit: code, kontrak: noKontrak, tanggal: tglKontrak, status, nilai,
      sales: uraiNama(r["Sales"]).nama,
      tindakan: ada ? "diperbarui" : "baru",
    });

    if (dryRun) {
      if (ada) diperbarui++; else baru++;
      // Nama marketing tetap diuraikan agar jumlahnya dapat dilaporkan, tetapi
      // tidak ada yang ditulis.
      for (const kol of ["Sales", "Sub Koordinator", "Koordinator"]) {
        const n = uraiNama(r[kol]).nama;
        if (n) cacheMarketing.set(n.toLowerCase(), "");
      }
      continue;
    }

    const sales = await marketingId(r["Sales"]);
    const sub = await marketingId(r["Sub Koordinator"]);
    const koor = await marketingId(r["Koordinator"]);

    // Prasyarat pencairan (SPU, PPJB, DP, P3U) tidak ada di laporan ini, jadi
    // tidak disentuh: menulis FALSE akan menghapus yang sudah dicatat Admin
    // Sales, dan menulis TRUE akan mengarang pemenuhan syarat yang belum terjadi.
    const nilaiKolom = [
      r["Project"] || "BIO DISTRICT", code.split("-")[0],
      r["Customer"] || null, r["Tipe"] || null,
      angka(r["Luas Tanah"]) || null, angka(r["Luas Bangunan"]) || null,
      r["Arah Hadap"] || null, r["Skema Cara Bayar"] || null,
      noKontrak, tglKontrak, nilai, status, tglBatal, sales, sub, koor,
    ];

    if (ada) {
      await query(
        `UPDATE units SET project_name=$2, cluster_code=$3, buyer_name=$4,
           unit_type=$5, land_area=$6, building_area=$7, orientation=$8,
           payment_scheme=$9, contract_number=$10, contract_date=$11,
           contract_value_incl_vat=$12, status=$13, cancelled_at=$14,
           marketing_id=$15, sub_coordinator_id=$16, coordinator_id=$17
         WHERE id=$1`,
        [ada.id, ...nilaiKolom], client);
      diperbarui++;
    } else {
      await query(
        `INSERT INTO units (code, project_name, cluster_code, buyer_name,
           unit_type, land_area, building_area, orientation, payment_scheme,
           contract_number, contract_date, contract_value_incl_vat, status,
           cancelled_at, marketing_id, sub_coordinator_id, coordinator_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [code, ...nilaiKolom], client);
      baru++;
    }
  }

  if (!dryRun) {
    await audit({
      entityType: "unit", action: "import_sales_report",
      actor: opsi.aktor ?? "cli",
      after: { file: opsi.namaBerkas ?? null, baru, diperbarui },
      reason: `Impor Laporan Penjualan: ${baru} penjualan baru, ` +
              `${diperbarui} diperbarui.`,
    }, client);
  }

  return {
    seksi: seksi.map((s) => ({ nama: s.seksi, baris: s.rows.length })),
    baru, diperbarui, dilewati,
    marketing: cacheMarketing.size,
    dry_run: dryRun,
    pratinjau,
    catatan: [
      "Marketing hasil impor berstatus 'draft' dan belum dapat menerima " +
      "pembayaran. Pendaftaran serta perekaman spesimen tanda tangannya harus " +
      "selesai lebih dulu.",
      "Prasyarat pencairan (SPU, PPJB, DP, Sign P3U) tidak ada di laporan ini " +
      "dan tidak diubah oleh impor.",
      "Satu baris adalah satu penjualan, bukan satu unit fisik: unit yang " +
      "pembelinya batal lalu dijual lagi menjadi dua baris dengan nomor " +
      "kontrak berbeda.",
    ],
  };
}
