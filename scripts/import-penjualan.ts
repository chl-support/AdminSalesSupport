/**
 * Impor Laporan Penjualan ke tabel units dan marketings.
 *
 * Pemakaian:
 *   DATABASE_URL='<url>' npm run db:import -- '<berkas laporan>'
 *   DATABASE_URL='<url>' npm run db:import -- '<berkas>' --dry-run
 *
 * Berkasnya berekstensi .xls tetapi isinya TSV — ekspor dari sistem penjualan,
 * bukan workbook Excel sungguhan. Dibaca sebagai teks bertab, bukan lewat
 * pustaka spreadsheet, karena memang bukan itu bentuknya.
 *
 * Laporan punya tiga seksi: A. Summary Penjualan, B. Pembatalan Unit, dan
 * C. Penjualan Netto. Yang diimpor adalah A sebagai dasar, lalu B dipakai untuk
 * menandai unit yang batal. C tidak diimpor terpisah karena ia hanya A dikurangi
 * B — mengimpornya akan menghitung unit yang sama dua kali.
 *
 * Idempoten: dijalankan ulang atas laporan yang sama tidak menggandakan apa pun.
 * Penjualan dicocokkan lewat nomor kontraknya, marketing lewat namanya.
 */

import { readFileSync } from "node:fs";

import { audit, one, pool, query } from "../src/lib/db";

// ───────────────────────── Pembacaan berkas ─────────────────────────

type Baris = Record<string, string>;

function baca(path: string): { seksi: string; hdr: string[]; rows: Baris[] }[] {
  const teks = readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = teks.split("\n");

  const hasil: { seksi: string; hdr: string[]; rows: Baris[] }[] = [];
  let i = 0;
  while (i < lines.length) {
    // Judul seksi berbentuk "A. Summary Penjualan"; barisnya sendiri tidak
    // bertab isi, hanya tab kosong sebagai pengisi kolom.
    const judul = lines[i].split("\t")[0].trim();
    if (/^[A-Z]\.\s/.test(judul)) {
      const hdr = lines[i + 1].split("\t").map((h) => h.trim());
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
const angka = (v: string) => {
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
function tanggal(v: string): string | null {
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
function uraiNama(v: string): { nama: string; agensi: string | null } {
  const s = String(v ?? "").trim();
  if (!s) return { nama: "", agensi: null };
  const i = s.indexOf("/");
  if (i < 0) return { nama: s.replace(/\s+/g, " "), agensi: null };
  return {
    nama: s.slice(0, i).trim().replace(/\s+/g, " "),
    agensi: s.slice(i + 1).trim().replace(/\s+/g, " ") || null,
  };
}

// ───────────────────────── Penyimpanan ─────────────────────────

const cacheAgensi = new Map<string, string>();
const cacheMarketing = new Map<string, string>();

async function agensiId(nama: string): Promise<string> {
  const kunci = nama.toLowerCase();
  if (cacheAgensi.has(kunci)) return cacheAgensi.get(kunci)!;
  const ada = await one<{ id: string }>(
    "SELECT id FROM agencies WHERE lower(name) = $1", [kunci]);
  const id = ada?.id ?? (await query<{ id: string }>(
    "INSERT INTO agencies (name) VALUES ($1) RETURNING id", [nama]))[0].id;
  cacheAgensi.set(kunci, id);
  return id;
}

/**
 * Marketing dibuat berstatus 'draft', bukan 'active'.
 *
 * Status aktif menandakan pendaftaran dan perekaman spesimen tanda tangan sudah
 * selesai — sesuatu yang tidak dapat disimpulkan dari laporan penjualan.
 * Menandainya aktif hanya karena namanya muncul di laporan akan melewati
 * pemeriksaan yang justru menjaga agar pembayaran tidak keluar kepada orang yang
 * tanda tangannya belum pernah direkam.
 */
async function marketingId(raw: string): Promise<string | null> {
  const { nama, agensi } = uraiNama(raw);
  if (!nama) return null;
  const kunci = nama.toLowerCase();
  if (cacheMarketing.has(kunci)) return cacheMarketing.get(kunci)!;

  const ada = await one<{ id: string }>(
    "SELECT id FROM marketings WHERE lower(full_name) = $1", [kunci]);
  let id = ada?.id;
  if (!id) {
    id = (await query<{ id: string }>(
      `INSERT INTO marketings (full_name, marketing_type, agency_id,
         npwp_type, recipient_type, phone, status)
       VALUES ($1,$2,$3,'none',$4,'',
               'draft')
       RETURNING id`,
      [nama, agensi ? "agent" : "inhouse",
       agensi ? await agensiId(agensi) : null,
       agensi ? "company" : "individual"]))[0].id;
  }
  cacheMarketing.set(kunci, id);
  return id;
}

// ───────────────────────── Alur utama ─────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const path = args.find((a) => !a.startsWith("--"));
  if (!path) {
    console.error(
      "Pemakaian: DATABASE_URL='<url>' npm run db:import -- " +
      "'<berkas laporan>' [--dry-run]");
    process.exit(2);
  }

  const seksi = baca(path);
  const summary = seksi.find((s) => /Summary Penjualan/i.test(s.seksi));
  const batal = seksi.find((s) => /Pembatalan/i.test(s.seksi));
  if (!summary) {
    console.error("Seksi 'A. Summary Penjualan' tidak ditemukan pada berkas ini.");
    process.exit(1);
  }

  console.log(`Berkas  : ${path}`);
  for (const s of seksi) console.log(`  ${s.seksi}: ${s.rows.length} baris`);
  if (dryRun) console.log("\n--dry-run: tidak ada yang ditulis ke basis data.\n");

  // Pembatalan ditandai lewat nomor kontrak, bukan kode unit: unit yang sama
  // dapat punya penjualan batal dan penjualan berjalan sekaligus, dan menandai
  // keduanya batal akan menghapus penjualan yang justru masih hidup.
  const dibatalkan = new Set(
    (batal?.rows ?? []).map((r) => r["No.Kontrak"]).filter(Boolean));

  let baru = 0, diperbarui = 0, dilewati = 0;

  for (const r of summary.rows) {
    const code = r["Unit"];
    if (!code) { dilewati++; continue; }

    const nilai = angka(r["Nilai Kontrak (Include PPN)"]);
    const tglKontrak = tanggal(r["Tgl. Kontrak"]);
    const tglBatal = tanggal(r["Tgl Batal"]);
    const status = tglBatal || dibatalkan.has(r["No.Kontrak"])
      ? "cancelled" : "booked";

    if (dryRun) {
      console.log(`  ${code.padEnd(12)} ${String(tglKontrak).padEnd(11)} ` +
                  `${status.padEnd(9)} ${nilai.toLocaleString("id-ID").padStart(16)} ` +
                  `${uraiNama(r["Sales"]).nama}`);
      continue;
    }

    const sales = await marketingId(r["Sales"]);
    const sub = await marketingId(r["Sub Koordinator"]);
    const koor = await marketingId(r["Koordinator"]);

    // Dicocokkan lewat nomor kontrak, bukan kode unit.
    //
    // Satu unit dapat terjual lebih dari sekali: pembelinya batal, unitnya
    // dijual lagi. Pada laporan ini sembilan kode unit muncul berulang dengan
    // pembeli berbeda. Mengunci pada kode unit membuat penjualan yang lebih baru
    // menimpa yang lama tanpa jejak — padahal klaim melekat pada penjualannya,
    // bukan pada batu batanya.
    const noKontrak = r["No.Kontrak"] || null;
    const ada = noKontrak
      ? await one<{ id: string }>(
          "SELECT id FROM units WHERE contract_number = $1", [noKontrak])
      : await one<{ id: string }>(
          "SELECT id FROM units WHERE code = $1 AND contract_number IS NULL",
          [code]);

    // Prasyarat pencairan (SPU, PPJB, DP, P3U) tidak ada di laporan ini, jadi
    // tidak disentuh: menulis FALSE akan menghapus yang sudah dicatat Admin
    // Sales, dan menulis TRUE akan mengarang pemenuhan syarat yang belum terjadi.
    if (ada) {
      await query(
        `UPDATE units SET project_name=$2, cluster_code=$3, buyer_name=$4,
           unit_type=$5, land_area=$6, building_area=$7, orientation=$8,
           payment_scheme=$9, contract_number=$10, contract_date=$11,
           contract_value_incl_vat=$12, status=$13, cancelled_at=$14,
           marketing_id=$15, sub_coordinator_id=$16, coordinator_id=$17
         WHERE id=$1`,
        [ada.id, r["Project"] || "BIO DISTRICT", code.split("-")[0],
         r["Customer"] || null, r["Tipe"] || null,
         angka(r["Luas Tanah"]) || null, angka(r["Luas Bangunan"]) || null,
         r["Arah Hadap"] || null, r["Skema Cara Bayar"] || null,
         noKontrak, tglKontrak, nilai, status, tglBatal,
         sales, sub, koor]);
      diperbarui++;
    } else {
      await query(
        `INSERT INTO units (code, project_name, cluster_code, buyer_name,
           unit_type, land_area, building_area, orientation, payment_scheme,
           contract_number, contract_date, contract_value_incl_vat, status,
           cancelled_at, marketing_id, sub_coordinator_id, coordinator_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [code, r["Project"] || "BIO DISTRICT", code.split("-")[0],
         r["Customer"] || null, r["Tipe"] || null,
         angka(r["Luas Tanah"]) || null, angka(r["Luas Bangunan"]) || null,
         r["Arah Hadap"] || null, r["Skema Cara Bayar"] || null,
         noKontrak, tglKontrak, nilai, status, tglBatal,
         sales, sub, koor]);
      baru++;
    }
  }

  if (!dryRun) {
    await audit({
      entityType: "unit", action: "import_sales_report", actor: "cli",
      after: { file: path, baru, diperbarui },
      reason: `Impor Laporan Penjualan: ${baru} unit baru, ${diperbarui} diperbarui.`,
    });
    console.log(`\n${baru} unit baru, ${diperbarui} diperbarui, ${dilewati} dilewati.`);
    console.log(`${cacheMarketing.size} marketing dikenali.`);
    console.log(
      "\nMarketing hasil impor berstatus 'draft' dan belum dapat menerima " +
      "pembayaran.\nSelesaikan pendaftaran serta perekaman spesimen tanda " +
      "tangannya lebih dulu.");
    console.log(
      "Prasyarat pencairan (SPU, PPJB, DP, Sign P3U) tidak ada di laporan ini " +
      "dan tidak diubah.");
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
