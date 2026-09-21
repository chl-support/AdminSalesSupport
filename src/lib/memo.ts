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

/** Batas ukuran berkas memo. Lebih longgar daripada lampiran klaim: memo
 *  skema kerap berupa pindaian beberapa halaman. */
export const BATAS = 10 * 1024 * 1024;

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
  })().catch(() => { sekali = null; });
  return sekali;
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
  },
) {
  await ensureKolomMemo();
  const judul = String(p.judul ?? "").trim();
  if (!judul) {
    throw new WorkflowError("Judul memo wajib diisi.", "validation", 422);
  }
  if (!p.buf?.length) {
    throw new WorkflowError("Berkas memo belum dipilih.", "file_required", 422);
  }
  if (p.buf.length > BATAS) {
    throw new WorkflowError(
      `Berkas ${(p.buf.length / 1024 / 1024).toFixed(1)} MB melebihi batas ` +
      `${BATAS / 1024 / 1024} MB.`, "file_too_large", 413);
  }
  const tipe = String(p.content_type ?? "").toLowerCase().split(";")[0].trim();
  if (!JENIS_DITERIMA.includes(tipe)) {
    throw new WorkflowError(
      "Jenis berkas tidak diterima. Unggah PDF, gambar, Excel, atau Word.",
      "file_type_rejected", 415);
  }

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
