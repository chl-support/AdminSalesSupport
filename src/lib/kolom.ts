/**
 * Tambahan skema yang dipasang dari sisi aplikasi, bukan dari migrasi.
 *
 * Alasannya sama dengan daftar project dan kolom rekap memo: apa pun yang
 * hanya tertulis di db/schema.sql baru sampai ke basis data ketika migrasi
 * dijalankan ulang, sementara endpoint penyiapan mematikan dirinya sendiri
 * setelah pemasangan pertama dan SETUP_SECRET dicabut sesudahnya — sebagaimana
 * dianjurkan. Kodenya ter-deploy, kolomnya tidak pernah ada, dan yang terlihat
 * di layar adalah galat 500.
 *
 * Tiga hal yang tertinggal seperti itu dikumpulkan di sini:
 *
 *   1. marketings.category — dibaca oleh layar Approval / Persetujuan dan Data
 *      Marketing. Tanpa kolomnya /api/claims menjawab 500 dan seluruh layar
 *      Approval kosong, bukan hanya kolom Kategorinya.
 *   2. claim_type 'continuity_reward' — tanpa nilainya /api/units menjawab
 *      `invalid input value for enum claim_type`.
 *   3. recipient_role 'bgb' dan 'sales_coordinator' — dua kategori penerima
 *      yang dapat dipilih di layar tetapi tidak dapat disimpan.
 *   4. claims.office_memo_no, received_at, sender_division, handed_to dan
 *      distributed_at — lima kolom Sirkulasi Dokumen yang diisi tangan.
 *      Tanpa kelimanya seluruh layar Sirkulasi menjawab "column
 *      c.office_memo_no does not exist", bukan hanya kolomnya yang kosong.
 *   5. CHECK ukuran pada claim_documents, disamakan dengan BATAS_FULL_SIGN.
 *      Tanpa itu dokumen full sign di atas sepuluh megabita ditolak basis
 *      data sesudah berkasnya terkirim utuh — lihat batasUkuranDokumen().
 *
 * Semuanya idempoten dan aman diulang; pemanggilan kedua tidak mengubah apa
 * pun. Kegagalannya sengaja ditelan — bila basis datanya memang belum ada,
 * galat yang perlu dibaca orang adalah galat aslinya, bukan galat ALTER TABLE.
 */

import { BATAS_FULL_SIGN } from "./batas";
import { query } from "./db";

/**
 * Nilai enum ditambahkan lebih dulu, dan masing-masing dengan perintahnya
 * sendiri.
 *
 * ALTER TYPE ... ADD VALUE tidak boleh sekalimat dengan pemakaian nilainya:
 * nilai yang baru ditambahkan belum dapat dipakai sebelum perintahnya
 * ter-commit. query() berjalan di atas pool tanpa transaksi terbuka, jadi tiap
 * baris di bawah ini commit sendiri-sendiri dan sudah sah dipakai oleh
 * permintaan berikutnya.
 */
const NILAI_ENUM: [string, string][] = [
  ["claim_type", "continuity_reward"],
  ["recipient_role", "bgb"],
  ["recipient_role", "sales_coordinator"],
];

/** Kategori yang sah — sama persis dengan CHECK di db/schema.sql. */
const KATEGORI_SAH = ["agent", "sales_inhouse", "sales_manager_inhouse",
                      "sales_markom", "markom", "bgb", "sales_coordinator"];

/**
 * CHECK ukuran pada claim_documents, disamakan dengan BATAS_FULL_SIGN.
 *
 * Batas unggah dijaga di tiga lapis, dan yang terakhir inilah yang paling
 * mahal bila tertinggal: badan permintaan Vercel dan batas di lapisan
 * aplikasi menolak sebelum berkasnya berangkat, sedangkan CHECK ini menolak
 * SESUDAH pindaian belasan halaman susah payah terkirim utuh — dengan galat
 * basis data yang tidak memberi tahu apa pun kepada yang mengunggahnya.
 *
 * Dipasang dari sini, bukan dibiarkan menunggu `npm run db:migrate`. Basis
 * data produksi dibuat sebelum angkanya dinaikkan, dan migrasi itu menuntut
 * DATABASE_URL produksi di tangan seseorang pada saat yang tepat — syarat
 * yang tidak pernah terpenuhi dengan sendirinya, sehingga perkaranya muncul
 * lagi setiap kali ada yang mengunggah dokumen besar.
 *
 * Definisinya dibaca lebih dulu, dan hanya ditulis ulang bila angkanya
 * memang belum cocok. ADD CONSTRAINT memindai seluruh tabel untuk memvalidasi
 * baris yang sudah ada; menjalankannya pada tiap proses baru berarti membayar
 * pindaian itu berulang kali tanpa ada yang berubah.
 */
async function batasUkuranDokumen(): Promise<void> {
  try {
    const ada = await query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
        WHERE c.conrelid = to_regclass('claim_documents')
          AND c.conname  = 'claim_documents_size_ck'`);
    if (ada[0]?.def?.includes(String(BATAS_FULL_SIGN))) return;

    await query(
      "ALTER TABLE claim_documents DROP CONSTRAINT IF EXISTS claim_documents_size_ck");
    await query(
      `ALTER TABLE claim_documents ADD CONSTRAINT claim_documents_size_ck
         CHECK (size_bytes IS NULL OR size_bytes <= ${BATAS_FULL_SIGN})`);
  } catch { /* tabelnya belum ada; menyusul di permintaan berikutnya */ }
}

async function pasang(): Promise<void> {
  for (const [tipe, nilai] of NILAI_ENUM) {
    await query(`ALTER TYPE ${tipe} ADD VALUE IF NOT EXISTS '${nilai}'`);
  }

  // Kolomnya TEXT, bukan enum recipient_role, meski isinya sama persis dengan
  // enum itu — dengan alasan yang sama seperti di db/schema.sql. Yang menjaga
  // isinya tetap sah adalah CHECK di bawah.
  await query("ALTER TABLE marketings ADD COLUMN IF NOT EXISTS category TEXT");

  // Baris yang sudah ada diisi dari marketing_type: seorang agent memang
  // berkategori Agent, dan inhouse berkategori Sales Inhouse. Yang di luar
  // keduanya — Markom, Sales Manager, Sales Koordinator, BGB — ditetapkan
  // Admin Sales dari layar Data Marketing; tidak ada yang dapat menebaknya
  // dari data yang sudah ada.
  await query(
    `UPDATE marketings SET category =
       CASE WHEN marketing_type = 'agent' THEN 'agent' ELSE 'sales_inhouse' END
      WHERE category IS NULL`);

  await query(
    "ALTER TABLE marketings ALTER COLUMN category SET DEFAULT 'sales_inhouse'");

  // Lima kolom Tabel Sirkulasi Dokumen yang tidak dapat disusun dari data
  // yang ada, jadi diisi tangan: nomor Internal Office Memo yang menyertai
  // berkas saat diedarkan, divisi pengirim dan divisi penerimanya, tanggal
  // berkasnya diserahkan, dan tanggal ia benar-benar diterima.
  //
  // Ketiganya yang terakhir memang punya bayangannya di sistem —
  // physical_location dan physical_since — tetapi bayangan itu hanya terisi
  // bila serah terimanya dicatat lewat layar Approval. Berkas yang diantar
  // langsung ke meja orang tidak pernah melewatinya, sehingga kolomnya kosong
  // justru pada berkas yang paling perlu dilacak.
  await query("ALTER TABLE claims ADD COLUMN IF NOT EXISTS office_memo_no TEXT");
  await query("ALTER TABLE claims ADD COLUMN IF NOT EXISTS received_at DATE");
  await query(
    "ALTER TABLE claims ADD COLUMN IF NOT EXISTS sender_division TEXT");
  // Periode penjualan yang direkap sebuah pengajuan Overriding, diketik pada
  // formulirnya: "Cut Off Penjualan As Of" dari tanggal sekian sampai sekian.
  // Sebelumnya periode itu disimpulkan dari tanggal kontrak unit yang
  // kebetulan masuk rekapnya — yang berarti lembar yang sama dapat menyebut
  // periode berbeda setiap kali dicetak ulang.
  await query(
    "ALTER TABLE claims ADD COLUMN IF NOT EXISTS sales_period_start DATE");
  await query(
    "ALTER TABLE claims ADD COLUMN IF NOT EXISTS sales_period_end DATE");
  await query("ALTER TABLE claims ADD COLUMN IF NOT EXISTS handed_to TEXT");
  await query("ALTER TABLE claims ADD COLUMN IF NOT EXISTS distributed_at DATE");
  // Satu berkas berpindah beberapa kali sebelum selesai, jadi keempat catatan
  // perpindahannya — divisi pengirim, divisi penerima, tanggal distribusi dan
  // tanggal penerima — masing-masing bertempat empat, sebanyak baris yang
  // disediakan Tabel Sirkulasi Dokumen di kantor. Bernomor, bukan larik:
  // keempat kolom yang pertama sudah berisi data, dan mengubah bentuk kolom
  // yang sudah terisi menukar risiko kehilangan data dengan kerapian belaka.
  for (const n of [2, 3, 4]) {
    await query(
      `ALTER TABLE claims ADD COLUMN IF NOT EXISTS sender_division_${n} TEXT`);
    await query(
      `ALTER TABLE claims ADD COLUMN IF NOT EXISTS handed_to_${n} TEXT`);
    await query(
      `ALTER TABLE claims ADD COLUMN IF NOT EXISTS distributed_at_${n} DATE`);
    await query(
      `ALTER TABLE claims ADD COLUMN IF NOT EXISTS received_at_${n} DATE`);
  }

  await query(
    `DO $$ BEGIN
       ALTER TABLE marketings ADD CONSTRAINT marketings_category_check
         CHECK (category IN (${KATEGORI_SAH.map((k) => `'${k}'`).join(",")}));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await batasUkuranDokumen();

  // Indeksnya menyebut project_id, yang juga hanya ditambahkan lewat
  // db/schema.sql. Kegagalannya tidak boleh menjatuhkan enam perintah di
  // atasnya, yang sudah commit sendiri-sendiri dan sudah menyelesaikan
  // masalahnya: indeks yang hilang memperlambat, kolom yang hilang mematikan
  // layar.
  try {
    await query(
      `CREATE INDEX IF NOT EXISTS idx_marketings_category
         ON marketings(project_id, category)`);
  } catch { /* project_id belum ada; indeksnya menyusul di deploy berikutnya */ }
}

/**
 * Sekali per proses, bukan sekali per permintaan.
 *
 * claimView() dipanggil sekali untuk tiap klaim pada satu layar; menjalankan
 * tujuh perintah DDL sebanyak itu tidak ada gunanya. Kegagalannya menghapus
 * penanda, sehingga permintaan berikutnya mencoba lagi — kegagalan sesaat
 * tidak boleh mengunci pemasangannya sampai proses ini berakhir.
 */
let sekali: Promise<void> | null = null;
export function ensureKolomMarketing(): Promise<void> {
  sekali ??= pasang().catch(() => { sekali = null; });
  return sekali;
}
