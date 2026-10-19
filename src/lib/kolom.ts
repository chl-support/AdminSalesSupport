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

/**
 * PPh 23 dipotong 2%, bukan 2,5%.
 *
 * Tarifnya duduk di basis data, bukan di kode, dan pemasangan lama terlanjur
 * memakai 2,5% untuk penerima badan usaha — angka yang dulu diambil dari
 * lampiran Detail Perhitungan yang berjalan. Finance sudah memutuskan 2%,
 * sementara PPh 21 tetap 2,5%, jadi barisnya dibetulkan dari sisi aplikasi:
 * endpoint penyiapan sudah mati dan SETUP_SECRET dicabut, sehingga tidak ada
 * lagi jalan menjalankan migrasi pada pemasangan yang sudah berjalan.
 *
 * Dijalankan SEKALI, ditandai di tabel settings. Tanpa penanda itu, tarif yang
 * kelak sengaja diubah orang akan dikembalikan ke 2% pada tiap deploy —
 * pembetulan satu kali berubah menjadi aturan yang memaksa.
 *
 * Klaim yang sudah terbit tidak ikut berubah: tiap klaim menyimpan tarifnya
 * sendiri pada snapshot, dan yang dihitung ulang hanyalah yang memang
 * diminta hitung ulang.
 */
async function tarifPph23(): Promise<void> {
  const sudah = await query<{ value: string }>(
    "SELECT value FROM settings WHERE key='tarif_pph23_2persen'");
  if (sudah.length) return;

  await query(
    `UPDATE tax_rates
        SET rate = 0.02,
            note = CASE WHEN has_skb THEN 'Pakai SKB: (Komisi + PPN) - PPh 2%'
                        ELSE '2% atas jasa untuk penerima badan usaha' END
      WHERE tax_type = 'pph23' AND rate = 0.025`);
  await query(
    `INSERT INTO settings (key, value) VALUES ('tarif_pph23_2persen','true')
     ON CONFLICT (key) DO NOTHING`);
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

  // Penanda satu pengajuan yang mencakup beberapa unit. Overiding diajukan
  // atas beberapa unit sekaligus — satu penerima, satu periode, satu keputusan
  // — tetapi tiap unit tetap klaim tersendiri, sebab nilai, PPN dan PPh-nya
  // dihitung per unit. Penanda inilah yang menyatukannya kembali di layar
  // Approval: satu baris, dengan unitnya tertulis sebagai beberapa poin.
  await query("ALTER TABLE claims ADD COLUMN IF NOT EXISTS batch_id UUID");

  // Kolom Ket. pada lembar Detail Perhitungan, diisi tangan. Keterangan yang
  // ada — remarks pada unitnya — menerangkan UNITNYA, dan lembar ini
  // menerangkan satu pengajuan atas unit itu; keduanya kerap berbeda, dan
  // menumpangkan yang satu pada yang lain berarti keterangan sebuah unit ikut
  // tercetak pada tiap pengajuan yang menyentuhnya.
  await query(
    "ALTER TABLE claims ADD COLUMN IF NOT EXISTS detail_keterangan TEXT");

  // Salinan sandi yang dapat dibaca kembali Admin IT — tersandi, bukan polos.
  // Lihat src/lib/sandi-terlihat.ts untuk apa yang ditukar dengannya.
  await query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enc TEXT");

  // Surel pengguna: alamat yang menerima kode verifikasi "lupa kata sandi".
  // Tanpa alamat ini, orang itu tidak punya jalan mengatur ulang sandinya
  // sendiri — jadi layar Admin IT meminta mengisinya.
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT");
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_email
       ON users (lower(email)) WHERE email IS NOT NULL`);

  // Permintaan atur ulang sandi. Kodenya disimpan sebagai hash, sama seperti
  // sandi: basis data yang terbaca orang tidak boleh menyerahkan kode yang
  // sedang berlaku.
  await query(
    `CREATE TABLE IF NOT EXISTS password_resets (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       email       TEXT NOT NULL,
       code_hash   TEXT NOT NULL,
       attempts    INT  NOT NULL DEFAULT 0,
       expires_at  TIMESTAMPTZ NOT NULL,
       used_at     TIMESTAMPTZ,
       ip_address  TEXT,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_password_resets_email
       ON password_resets (lower(email), created_at DESC)`);

  // Pendaftaran alamat surel oleh penggunanya sendiri: kode yang dikirim ke
  // alamat yang diketiknya, untuk membuktikan alamat itu memang dapat ia buka.
  await query(
    `CREATE TABLE IF NOT EXISTS email_verifications (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       email       TEXT NOT NULL,
       code_hash   TEXT NOT NULL,
       attempts    INT  NOT NULL DEFAULT 0,
       expires_at  TIMESTAMPTZ NOT NULL,
       used_at     TIMESTAMPTZ,
       ip_address  TEXT,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_email_verifications_user
       ON email_verifications (user_id, created_at DESC)`);

  // Riwayat pengiriman surel: kapan, ke alamat mana, untuk siapa, jenisnya
  // apa, berhasil atau tidak. Tanpa catatan ini, "surelnya tidak sampai" tidak
  // dapat dijawab selain dengan tebakan.
  await query(
    `CREATE TABLE IF NOT EXISTS surel_log (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       kepada      TEXT NOT NULL,
       perihal     TEXT NOT NULL,
       jenis       TEXT NOT NULL,
       user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
       berhasil    BOOLEAN NOT NULL,
       galat       TEXT,
       created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_surel_log_waktu
       ON surel_log (created_at DESC)`);

  // Pengirim per project: nomor WhatsApp yang dipakai mengirim tautan ke
  // Sales/Agent, dan alamat email beserta akun pengirimnya. Berada di basis
  // data, bukan di Environment Variables, karena nilainya berbeda tiap
  // project sementara environment hanya punya satu nilai untuk seluruh
  // aplikasi. Sandi aplikasinya disandikan, bukan disimpan polos.
  for (const kolom of ["wa_pengirim TEXT", "surel_pengirim TEXT",
                       "smtp_user TEXT", "smtp_pass_enc TEXT",
                       "smtp_host TEXT", "smtp_port INT"]) {
    await query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS ${kolom}`);
  }

  // Project yang bersangkutan pada riwayat pengiriman, supaya terbaca email
  // mana yang keluar atas nama project mana.
  await query("ALTER TABLE surel_log ADD COLUMN IF NOT EXISTS project_id UUID");

  await query(
    `DO $$ BEGIN
       ALTER TABLE marketings ADD CONSTRAINT marketings_category_check
         CHECK (category IN (${KATEGORI_SAH.map((k) => `'${k}'`).join(",")}));
     EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await batasUkuranDokumen();
  await tarifPph23();

  // Agensi milik project, bukan milik seluruh basis data.
  //
  // Tiap project bekerja dengan agensi yang berbeda-beda, dan nama yang sama
  // pada dua project adalah dua baris: alamat, NPWP, dan status PKP-nya diurus
  // sendiri-sendiri. Satu baris bersama berarti perubahan NPWP yang dicatat
  // satu project diam-diam berlaku di project lain — dan NPWP itulah yang
  // memilih tarif pajak pada klaimnya.
  await query(
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id)");

  // Baris lama tidak punya project. Yang menentukan pemiliknya adalah
  // marketing yang menunjuknya: tiap project yang memakai agensi itu mendapat
  // salinannya sendiri, marketingnya diarahkan ke salinan itu, dan baris lama
  // yang tidak lagi ditunjuk siapa pun dibuang. Agensi yang tidak pernah
  // ditunjuk marketing mana pun dibiarkan — tidak ada yang tahu milik project
  // mana, dan menebaknya lebih buruk daripada membiarkannya.
  await query(
    `INSERT INTO agencies (name, address, npwp, pkp_status, has_skb,
                           skb_valid_until, project_id)
     SELECT DISTINCT a.name, a.address, a.npwp, a.pkp_status, a.has_skb,
            a.skb_valid_until, m.project_id
       FROM agencies a JOIN marketings m ON m.agency_id = a.id
      WHERE a.project_id IS NULL AND m.project_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM agencies b
                         WHERE b.project_id = m.project_id
                           AND lower(b.name) = lower(a.name))`);
  await query(
    `UPDATE marketings m SET agency_id = b.id
       FROM agencies a, agencies b
      WHERE m.agency_id = a.id AND a.project_id IS NULL
        AND b.project_id = m.project_id AND lower(b.name) = lower(a.name)`);
  await query(
    `DELETE FROM agencies a
      WHERE a.project_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM marketings m WHERE m.agency_id = a.id)`);

  try {
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uniq_agencies_project_nama
         ON agencies (project_id, lower(name)) WHERE project_id IS NOT NULL`);
  } catch { /* nama kembar dalam satu project; dibereskan dulu oleh orangnya */ }

  // Nomor kontrak unik per project, bukan di seluruh basis data.
  //
  // db/schema.sql sudah menukarnya, tetapi migrasi itu hanya berjalan lewat
  // /setup dengan SETUP_SECRET — yang sengaja dicabut dari Vercel sesudah
  // dipakai. Pemasangan yang melewatkannya masih memegang indeks menyeluruh
  // uniq_units_contract, dan di sana unggahan Laporan Penjualan project kedua
  // gagal dengan 23505 hanya karena project pertama kebetulan memakai nomor
  // kontrak yang sama. Tiap project menomori kontraknya sendiri, jadi
  // keunikannya memang milik project.
  //
  // Yang baru dibuat lebih dulu, yang lama dijatuhkan sesudah ia ada: bila
  // pembuatannya gagal — mis. masih ada nomor kembar di dalam satu project —
  // perlindungan lama tetap berdiri, dan tidak ada yang bertambah buruk.
  try {
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uniq_units_contract_project
         ON units (project_id, contract_number) WHERE contract_number IS NOT NULL`);
    const ada = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_indexes
        WHERE indexname = 'uniq_units_contract_project'`);
    if (ada[0]?.n) await query("DROP INDEX IF EXISTS uniq_units_contract");
  } catch { /* nomor kembar di satu project; dibereskan dulu oleh orangnya */ }

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
