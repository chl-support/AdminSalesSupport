/**
 * Berkas memo, sebagai lampiran rujukan.
 *
 * Isinya tidak dibaca sistem: tarif yang dipakai menghitung tetap berasal dari
 * tabel skema insentif. Yang disimpan di sini adalah dasar tertulisnya — berkas
 * yang dapat dibuka saat ada yang mempertanyakan sebuah angka, tanpa
 * mencari-cari di percakapan atau surel.
 *
 * Karena itu tidak ada "persetujuan" yang mengubah perilaku apa pun di sini.
 * Menyediakan tombol setuju yang tidak menggerakkan apa-apa justru berbahaya:
 * orang akan mengira angka pada layar berikutnya sudah mengikuti memo yang baru
 * disetujui, padahal tidak.
 */

import { audit, one, query } from "./db";
import { WorkflowError } from "./workflow";
import type { BarisSkema } from "./memo-skema";

/** Batas ukuran berkas memo. Lebih longgar daripada lampiran klaim: memo
 *  skema kerap berupa pindaian beberapa halaman. */
export const BATAS = 10 * 1024 * 1024;

/**
 * Satu aturan berkas untuk memo dan lampirannya.
 *
 * Dipisah ke fungsinya sendiri supaya keduanya tidak punya dua salinan aturan
 * yang cepat atau lambat berbeda — dan yang berbeda itu akan berupa berkas
 * yang diterima di satu tempat lalu ditolak di tempat lain.
 */
export function jenisBerkas(contentType: string) {
  return String(contentType ?? "").toLowerCase().split(";")[0].trim();
}

export function periksaBerkas(buf: Buffer, contentType: string) {
  if (!buf?.length) {
    throw new WorkflowError("Berkas belum dipilih.", "file_required", 422);
  }
  if (buf.length > BATAS) {
    throw new WorkflowError(
      `Berkas ${(buf.length / 1024 / 1024).toFixed(1)} MB melebihi batas ` +
      `${BATAS / 1024 / 1024} MB.`, "file_too_large", 413);
  }
  if (!JENIS_DITERIMA.includes(jenisBerkas(contentType))) {
    throw new WorkflowError(
      "Jenis berkas tidak diterima. Unggah PDF, gambar, Excel, atau Word.",
      "file_type_rejected", 415);
  }
}

const JENIS_DITERIMA = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

/**
 * Kolom rekapitulasi dipastikan ada, sekali per proses.
 *
 * Alasannya sama dengan daftar project: kolom yang hanya ditambahkan lewat
 * db/schema.sql baru sampai ke basis data ketika migrasi dijalankan ulang, dan
 * setelah SETUP_SECRET dicabut — sebagaimana dianjurkan — tidak ada lagi jalan
 * menjalankannya dari luar terminal. Satu deploy sudah cukup dengan cara ini.
 *
 * ADD COLUMN IF NOT EXISTS aman diulang: pemanggilan kedua tidak mengubah apa
 * pun. Kegagalannya sengaja ditelan — bila basis datanya memang belum ada,
 * galat yang terbaca sebaiknya galat aslinya, bukan galat ALTER TABLE.
 */
const KOLOM_REKAP = [
  "tanggal_memo DATE", "dari TEXT", "kepada TEXT", "nilai_skema TEXT",
  "dokumen_wajib TEXT", "diajukan_oleh TEXT", "diketahui_oleh TEXT",
  "disetujui_oleh TEXT",
];

let sekali: Promise<void> | null = null;
export function ensureKolomMemo(): Promise<void> {
  sekali ??= (async () => {
    for (const k of KOLOM_REKAP) {
      await query(`ALTER TABLE memos ADD COLUMN IF NOT EXISTS ${k}`);
    }
    await query(
      `CREATE TABLE IF NOT EXISTS memo_files (
         id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         memo_id      UUID NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
         label        TEXT,
         file_name    TEXT NOT NULL,
         content_type TEXT NOT NULL,
         size_bytes   INT NOT NULL
                      CHECK (size_bytes > 0 AND size_bytes <= 10485760),
         content      BYTEA NOT NULL,
         uploaded_by  TEXT NOT NULL,
         uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_memo_files_memo
         ON memo_files(memo_id, uploaded_at)`);
    // Rincian kolom "Nilai / Skema Fee". Di dalam memonya ia bukan satu
    // kalimat melainkan beberapa tabel berkategori, dan disimpan sebagai satu
    // kalimat isinya tidak dapat dicari maupun dibandingkan antar memo.
    await query(
      `CREATE TABLE IF NOT EXISTS memo_skema (
         id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         memo_id    UUID NOT NULL REFERENCES memos(id) ON DELETE CASCADE,
         kelompok   TEXT NOT NULL,
         urutan     INT  NOT NULL,
         kategori   TEXT,
         nilai      TEXT,
         keterangan TEXT,
         baris      INT  NOT NULL)`);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_memo_skema_memo
         ON memo_skema(memo_id, baris)`);
    // Titipan berkas yang dikirim bertahap. Lihat mulaiUnggah().
    await query(
      `CREATE TABLE IF NOT EXISTS memo_unggah (
         id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         file_name    TEXT NOT NULL,
         content_type TEXT NOT NULL,
         uploaded_by  TEXT NOT NULL,
         created_at   TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await query(
      `CREATE TABLE IF NOT EXISTS memo_unggah_bagian (
         unggah_id UUID NOT NULL
                   REFERENCES memo_unggah(id) ON DELETE CASCADE,
         urutan    INT  NOT NULL,
         data      BYTEA NOT NULL,
         PRIMARY KEY (unggah_id, urutan))`);
  })().catch(() => { sekali = null; });
  return sekali;
}

/**
 * Berkas yang dikirim bertahap, sepotong demi sepotong.
 *
 * Fungsi serverless membatasi besar satu permintaan masuk — di Vercel 4,5 MB
 * — sedangkan memo pindaian beberapa halaman kerap lebih besar daripada itu.
 * Permintaan yang melampauinya diputus di tepi jaringan sebelum sempat
 * mencapai kode ini, sehingga peramban tidak menerima jawaban apa pun dan
 * hanya dapat melaporkan "Failed to fetch": tanpa status, tanpa keterangan,
 * tanpa petunjuk apa yang salah.
 *
 * Karena itu berkas besar tidak pernah dikirim utuh. Ia dipecah di peramban,
 * tiap potong dikirim sebagai permintaan tersendiri yang jauh di bawah batas,
 * lalu dirakit kembali di sini. Yang membatasi besar berkas kini hanya aturan
 * aplikasinya sendiri, bukan batas fungsi yang tidak dapat diubah.
 *
 * Titipan yang tidak pernah dirakit — karena unggahannya ditinggalkan di
 * tengah jalan — disapu bersama pemanggilan berikutnya.
 */
export async function mulaiUnggah(
  nama: string, tipe: string, aktor: string,
): Promise<string> {
  await ensureKolomMemo();
  await sapuUnggah();
  const r = await one<{ id: string }>(
    `INSERT INTO memo_unggah (file_name, content_type, uploaded_by)
     VALUES ($1,$2,$3) RETURNING id`,
    [String(nama ?? "memo").slice(0, 300),
     jenisBerkas(tipe) || "application/octet-stream", aktor]);
  return r!.id;
}

/** Satu potong berkas. Urutannya dari 0, dan boleh tiba tidak berurutan. */
export async function simpanBagian(
  id: string, urutan: number, buf: Buffer, aktor: string,
) {
  await ensureKolomMemo();
  const t = await one<{ uploaded_by: string }>(
    "SELECT uploaded_by FROM memo_unggah WHERE id=$1", [id]);
  if (!t) throw new WorkflowError("Unggahan tidak ditemukan.", "not_found", 404);
  // Titipan orang lain tidak dapat disisipi: id-nya acak, tetapi tebakan yang
  // berhasil sekali pun tidak boleh cukup untuk menyusupkan isi berkas.
  if (t.uploaded_by !== aktor) {
    throw new WorkflowError("Unggahan tidak ditemukan.", "not_found", 404);
  }
  if (!buf?.length) {
    throw new WorkflowError("Potongan kosong.", "validation", 422);
  }
  const besar = await one<{ n: string }>(
    `SELECT COALESCE(SUM(length(data)),0)::text AS n
       FROM memo_unggah_bagian WHERE unggah_id=$1`, [id]);
  if (Number(besar!.n) + buf.length > BATAS) {
    await query("DELETE FROM memo_unggah WHERE id=$1", [id]);
    throw new WorkflowError(
      `Berkas melebihi batas ${BATAS / 1024 / 1024} MB.`, "file_too_large", 413);
  }
  await query(
    `INSERT INTO memo_unggah_bagian (unggah_id, urutan, data)
     VALUES ($1,$2,$3)
     ON CONFLICT (unggah_id, urutan) DO UPDATE SET data = EXCLUDED.data`,
    [id, urutan, buf]);
  return { ok: true };
}

/**
 * Merakit kembali potongan-potongannya tanpa membuang titipannya.
 *
 * Dipakai layar pembacaan, yang hanya mengusulkan isian: berkasnya masih
 * dibutuhkan utuh ketika tombol unggah ditekan, dan mengirim ulang seluruh
 * potongannya berarti satu memo diunggah dua kali.
 */
export async function lihatUnggah(id: string, aktor: string) {
  return ambilUnggah(id, aktor, false);
}

/** Merakit kembali potongan-potongannya, lalu membuang titipannya. */
export async function rakitUnggah(id: string, aktor: string) {
  return ambilUnggah(id, aktor, true);
}

async function ambilUnggah(id: string, aktor: string, buang: boolean) {
  await ensureKolomMemo();
  const t = await one<{ file_name: string; content_type: string;
                        uploaded_by: string }>(
    "SELECT file_name, content_type, uploaded_by FROM memo_unggah WHERE id=$1",
    [id]);
  if (!t || t.uploaded_by !== aktor) {
    throw new WorkflowError("Unggahan tidak ditemukan.", "not_found", 404);
  }
  const bagian = await query<{ data: Buffer }>(
    "SELECT data FROM memo_unggah_bagian WHERE unggah_id=$1 ORDER BY urutan",
    [id]);
  if (!bagian.length) {
    throw new WorkflowError("Berkas belum terkirim.", "file_required", 422);
  }
  if (buang) await query("DELETE FROM memo_unggah WHERE id=$1", [id]);
  return {
    buf: Buffer.concat(bagian.map((b) => b.data)),
    file_name: t.file_name,
    content_type: t.content_type,
  };
}

/** Titipan yang ditinggalkan di tengah jalan tidak boleh menumpuk selamanya. */
async function sapuUnggah() {
  await query(
    "DELETE FROM memo_unggah WHERE created_at < now() - interval '2 hours'")
    .catch(() => { /* penyapuan bukan bagian dari pekerjaan yang diminta */ });
}

export async function daftarMemo(projectId: string) {
  await ensureKolomMemo();
  return query(
    `SELECT id, nomor, judul, keterangan, berlaku_dari, berlaku_sampai,
            tanggal_memo, dari, kepada, nilai_skema, dokumen_wajib,
            diajukan_oleh, diketahui_oleh, disetujui_oleh,
            file_name, content_type, size_bytes, uploaded_by, uploaded_at
       FROM memos WHERE project_id = $1
      ORDER BY COALESCE(tanggal_memo, berlaku_dari, uploaded_at::date) DESC,
               uploaded_at DESC`,
    [projectId]);
}

/**
 * Rincian skema fee seluruh memo pada satu project, sekali ambil.
 *
 * Sejalan dengan lampiranProject(): layar rekapitulasi membuka rinciannya
 * per baris, dan satu permintaan per memo berarti sepuluh perjalanan
 * bolak-balik untuk sesuatu yang sudah diketahui seluruhnya di sini.
 */
export async function skemaProject(projectId: string) {
  await ensureKolomMemo();
  return query(
    `SELECT s.id, s.memo_id, s.kelompok, s.urutan, s.kategori, s.nilai,
            s.keterangan
       FROM memo_skema s JOIN memos m ON m.id = s.memo_id
      WHERE m.project_id = $1
      ORDER BY s.memo_id, s.baris`,
    [projectId]);
}

/**
 * Nama-nama yang ejaannya sudah dipastikan benar.
 *
 * Dipakai untuk membetulkan ejaan hasil OCR pada blok tanda tangan memo.
 * Sumbernya dua, dan keduanya diperlukan:
 *
 *   - users.full_name — nama pengguna sistem, diketik saat akunnya dibuat.
 *     Inilah yang menolong memo *pertama* sebuah project, saat belum ada memo
 *     terdahulu yang bisa dijadikan acuan.
 *   - nama penanda tangan pada memo yang sudah tersimpan, dari SELURUH
 *     project, bukan project yang sedang dibuka saja. Penanda tangan memo
 *     berulang lintas project, dan yang menyetujui Banara hari ini menyetujui
 *     Naraya minggu depan.
 *
 * Nilai yang berisi beberapa nama dipisah di sini, di basis datanya, supaya
 * pemanggilnya menerima satu nama per baris.
 */
export async function namaDikenal(): Promise<string[]> {
  await ensureKolomMemo();
  const baris = await query<{ nama: string }>(
    `SELECT DISTINCT trim(nama) AS nama FROM (
           SELECT unnest(string_to_array(diajukan_oleh,  ',')) AS nama
             FROM memos WHERE diajukan_oleh  IS NOT NULL
       UNION SELECT unnest(string_to_array(diketahui_oleh, ',')) FROM memos
             WHERE diketahui_oleh IS NOT NULL
       UNION SELECT unnest(string_to_array(disetujui_oleh, ',')) FROM memos
             WHERE disetujui_oleh IS NOT NULL
       UNION SELECT full_name FROM users WHERE active
     ) x
      WHERE length(trim(nama)) >= 3
      ORDER BY 1`);
  return baris.map((b) => b.nama);
}

/**
 * Lampiran seluruh memo pada satu project, sekali ambil.
 *
 * Diambil bersama daftarnya, bukan satu permintaan per memo: layar
 * rekapitulasi menampilkan semuanya sekaligus, dan sepuluh memo berarti
 * sepuluh perjalanan bolak-balik yang tidak perlu. Isi berkasnya sendiri tidak
 * ikut — yang dibutuhkan daftar ini hanya namanya.
 */
export async function lampiranProject(projectId: string) {
  await ensureKolomMemo();
  return query(
    `SELECT f.id, f.memo_id, f.label, f.file_name, f.content_type,
            f.size_bytes, f.uploaded_by, f.uploaded_at
       FROM memo_files f JOIN memos m ON m.id = f.memo_id
      WHERE m.project_id = $1
      ORDER BY f.uploaded_at`,
    [projectId]);
}

/** Satu lampiran, untuk dibuka atau diunduh. */
export async function berkasLampiran(id: string, projectId: string) {
  const f = await one<{
    file_name: string; content_type: string; content: Buffer;
  }>(`SELECT f.file_name, f.content_type, f.content
        FROM memo_files f JOIN memos m ON m.id = f.memo_id
       WHERE f.id = $1 AND m.project_id = $2`, [id, projectId]);
  if (!f) throw new WorkflowError("Lampiran tidak ditemukan.", "not_found", 404);
  return f;
}

/** Simpan satu lampiran pada sebuah memo. */
export async function simpanLampiran(
  memoId: string, projectId: string, aktor: string,
  p: { label?: string | null; file_name: string; content_type: string;
       buf: Buffer },
) {
  await ensureKolomMemo();
  const m = await one<{ judul: string }>(
    "SELECT judul FROM memos WHERE id=$1 AND project_id=$2", [memoId, projectId]);
  if (!m) throw new WorkflowError("Memo tidak ditemukan.", "not_found", 404);

  periksaBerkas(p.buf, p.content_type);
  const tipe = jenisBerkas(p.content_type);

  const f = await one<{ id: string }>(
    `INSERT INTO memo_files (memo_id, label, file_name, content_type,
       size_bytes, content, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [memoId, p.label?.trim() || null, p.file_name, tipe, p.buf.length,
     p.buf, aktor]);

  await audit({
    entityType: "memo", entityId: memoId, action: "memo_file_attached",
    actor: aktor,
    after: { memo: m.judul, label: p.label ?? null, file: p.file_name,
             size_bytes: p.buf.length },
  });
  return { id: f!.id, file_name: p.file_name };
}

/**
 * Hapus satu lampiran.
 *
 * Nama berkasnya ikut tercatat pada jejak audit sebelum hilang, sama seperti
 * memonya: lampiran yang dihapus tetap pernah menjadi pendukung angka yang
 * sudah dibayarkan.
 */
export async function hapusLampiran(id: string, projectId: string, aktor: string) {
  const f = await one<{ memo_id: string; file_name: string; label: string | null }>(
    `SELECT f.memo_id, f.file_name, f.label
       FROM memo_files f JOIN memos m ON m.id = f.memo_id
      WHERE f.id = $1 AND m.project_id = $2`, [id, projectId]);
  if (!f) throw new WorkflowError("Lampiran tidak ditemukan.", "not_found", 404);

  await query("DELETE FROM memo_files WHERE id=$1", [id]);
  await audit({
    entityType: "memo", entityId: f.memo_id, action: "memo_file_deleted",
    actor: aktor, before: { file: f.file_name, label: f.label },
  });
  return { ok: true };
}

export type RekapMemo = {
  tanggal_memo?: string | null; dari?: string | null; kepada?: string | null;
  nilai_skema?: string | null; dokumen_wajib?: string | null;
  diajukan_oleh?: string | null; diketahui_oleh?: string | null;
  disetujui_oleh?: string | null;
};

export async function simpanMemo(
  projectId: string, aktor: string,
  p: RekapMemo & {
    judul: string; nomor?: string | null; keterangan?: string | null;
    berlaku_dari?: string | null; berlaku_sampai?: string | null;
    file_name: string; content_type: string; buf: Buffer;
    skema?: BarisSkema[] | null;
  },
) {
  await ensureKolomMemo();
  const judul = String(p.judul ?? "").trim();
  if (!judul) {
    throw new WorkflowError("Judul memo wajib diisi.", "validation", 422);
  }
  periksaBerkas(p.buf, p.content_type);
  const tipe = jenisBerkas(p.content_type);

  const bersih = (v?: string | null) => (v?.trim() ? v.trim() : null);

  const m = await one<{ id: string }>(
    `INSERT INTO memos (project_id, nomor, judul, keterangan, berlaku_dari,
       berlaku_sampai, tanggal_memo, dari, kepada, nilai_skema, dokumen_wajib,
       diajukan_oleh, diketahui_oleh, disetujui_oleh,
       file_name, content_type, size_bytes, content, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [projectId, bersih(p.nomor), judul, bersih(p.keterangan),
     p.berlaku_dari || null, p.berlaku_sampai || null,
     p.tanggal_memo || null, bersih(p.dari), bersih(p.kepada),
     bersih(p.nilai_skema), bersih(p.dokumen_wajib), bersih(p.diajukan_oleh),
     bersih(p.diketahui_oleh), bersih(p.disetujui_oleh),
     p.file_name, tipe, p.buf.length, p.buf, aktor]);

  // Rincian skemanya ditulis apa adanya, termasuk barisnya yang kosong
  // sebagiannya: yang mengunggah sudah sempat memeriksanya di layar, dan
  // baris yang hilang lebih merepotkan daripada baris yang perlu dirapikan.
  for (const [i, b] of (p.skema ?? []).entries()) {
    if (!b.kategori?.trim() && !b.nilai?.trim() && !b.keterangan?.trim()) continue;
    await query(
      `INSERT INTO memo_skema
         (memo_id, kelompok, urutan, kategori, nilai, keterangan, baris)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [m!.id, String(b.kelompok ?? "").trim() || "Skema", Number(b.urutan) || i + 1,
       bersih(b.kategori), bersih(b.nilai), bersih(b.keterangan), i]);
  }

  await audit({
    entityType: "memo", entityId: m!.id, action: "memo_uploaded", actor: aktor,
    after: { judul, nomor: p.nomor ?? null, file: p.file_name,
             size_bytes: p.buf.length },
  });
  return { id: m!.id, judul };
}

/** Berkas satu memo, untuk dibuka atau diunduh. */
export async function berkasMemo(id: string, projectId: string) {
  const m = await one<{
    file_name: string; content_type: string; content: Buffer;
  }>(`SELECT file_name, content_type, content FROM memos
       WHERE id = $1 AND project_id = $2`, [id, projectId]);
  if (!m) throw new WorkflowError("Memo tidak ditemukan.", "not_found", 404);
  return m;
}

/** Kolom memo yang boleh diubah setelah tersimpan. */
export type UbahMemo = {
  nomor?: string | null; judul?: string | null; keterangan?: string | null;
  tanggal_memo?: string | null; berlaku_dari?: string | null;
  berlaku_sampai?: string | null; dari?: string | null;
};

/**
 * Membetulkan kolom memo yang sudah tersimpan.
 *
 * Kolom-kolom ini dibaca mesin dari lembar memonya, dan pembacaan gambar
 * tidak selalu tepat — tanggal yang gagal terbaca tersimpan kosong dan baru
 * ketahuan berbulan kemudian, saat rekapitulasinya dibaca orang. Tanpa jalan
 * membetulkannya, satu-satunya jalan adalah menghapus memonya lalu
 * mengunggahnya kembali; itu memutus lampiran yang sudah menempel padanya dan
 * meninggalkan jejak "dihapus" pada memo yang sebenarnya tidak salah.
 *
 * Yang tidak dapat diubah: berkas memonya sendiri. Berkas adalah buktinya;
 * mengganti berkas di bawah nomor yang sama berarti dua dokumen berbeda
 * pernah menyandang satu keterangan. Untuk itu memonya diunggah baru.
 *
 * Nilai sebelum dan sesudahnya dicatat pada jejak audit, hanya untuk kolom
 * yang benar-benar berubah.
 */
export async function ubahMemo(
  id: string, projectId: string, aktor: string, p: UbahMemo,
) {
  await ensureKolomMemo();
  const lama = await one<Record<string, any>>(
    `SELECT nomor, judul, keterangan, tanggal_memo, berlaku_dari,
            berlaku_sampai, dari
       FROM memos WHERE id=$1 AND project_id=$2`,
    [id, projectId]);
  if (!lama) throw new WorkflowError("Memo tidak ditemukan.", "not_found", 404);

  const teks = (v?: string | null) =>
    v === undefined ? undefined : (v?.trim() ? v.trim() : null);
  const tgl = (v?: string | null) =>
    v === undefined ? undefined : (v?.trim() ? v.trim() : null);

  const baru: Record<string, string | null> = {};
  for (const [k, v] of Object.entries({
    nomor: teks(p.nomor), judul: teks(p.judul), keterangan: teks(p.keterangan),
    dari: teks(p.dari), tanggal_memo: tgl(p.tanggal_memo),
    berlaku_dari: tgl(p.berlaku_dari), berlaku_sampai: tgl(p.berlaku_sampai),
  })) if (v !== undefined) baru[k] = v;

  // Judul adalah satu-satunya kolom yang tidak boleh kosong: ia yang menyebut
  // memo itu pada seluruh layar, dan memo tanpa judul hanya berupa baris
  // kosong yang tidak dapat dipilih maupun dicari.
  if ("judul" in baru && !baru.judul) {
    throw new WorkflowError("Judul memo wajib diisi.", "validation", 422);
  }

  // Tanggal DATE kembali dari PostgreSQL sebagai objek Date. Dibandingkan apa
  // adanya, setiap penyimpanan akan tampak sebagai perubahan.
  const iso = (v: any) => {
    if (!v) return null;
    if (v instanceof Date) {
      const q = (n: number) => String(n).padStart(2, "0");
      return `${v.getFullYear()}-${q(v.getMonth() + 1)}-${q(v.getDate())}`;
    }
    return String(v).slice(0, 10);
  };
  const TANGGAL = new Set(["tanggal_memo", "berlaku_dari", "berlaku_sampai"]);
  const berubah: Record<string, { dari: any; jadi: any }> = {};
  for (const [k, v] of Object.entries(baru)) {
    const sebelum = TANGGAL.has(k) ? iso(lama[k]) : (lama[k] ?? null);
    if (sebelum !== v) berubah[k] = { dari: sebelum, jadi: v };
  }
  if (!Object.keys(berubah).length) return { ok: true, berubah: 0 };

  const kunci = Object.keys(berubah);
  await query(
    `UPDATE memos SET ${kunci.map((k, i) => `${k}=$${i + 3}`).join(", ")}
      WHERE id=$1 AND project_id=$2`,
    [id, projectId, ...kunci.map((k) => berubah[k].jadi)]);

  await audit({
    entityType: "memo", entityId: id, action: "memo_edited", actor: aktor,
    before: Object.fromEntries(kunci.map((k) => [k, berubah[k].dari])),
    after: Object.fromEntries(kunci.map((k) => [k, berubah[k].jadi])),
  });
  return { ok: true, berubah: kunci.length };
}

/**
 * Hapus memo.
 *
 * Judul dan nomornya ikut tercatat pada jejak audit sebelum hilang: memo yang
 * dihapus tetap pernah menjadi dasar angka yang sudah dibayarkan, dan
 * "berkasnya sudah tidak ada" bukan jawaban atas pertanyaan mana dasarnya.
 */
export async function hapusMemo(id: string, projectId: string, aktor: string) {
  const m = await one<{ judul: string; nomor: string | null; file_name: string }>(
    "SELECT judul, nomor, file_name FROM memos WHERE id=$1 AND project_id=$2",
    [id, projectId]);
  if (!m) throw new WorkflowError("Memo tidak ditemukan.", "not_found", 404);

  await query("DELETE FROM memos WHERE id=$1", [id]);
  await audit({
    entityType: "memo", entityId: id, action: "memo_deleted", actor: aktor,
    before: { judul: m.judul, nomor: m.nomor, file: m.file_name },
  });
  return { ok: true };
}
