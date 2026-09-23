/**
 * Lampiran klaim — Kwitansi, Invoice, dan dokumen pendukung lainnya.
 *
 * Isinya benar-benar disimpan, bukan hanya namanya. Sebelumnya yang tercatat
 * hanya `file_name`, sehingga Finance membuka klaim dan menemukan daftar nama
 * berkas tanpa berkasnya — daftar yang tidak dapat diperiksa sama sekali.
 *
 * Bytea di PostgreSQL, bukan penyimpanan objek: sistem ini sudah bergantung pada
 * satu basis data dan tidak pada layanan lain, dan menambah satu lagi berarti
 * menambah satu kredensial, satu kuota, dan satu cara gagal yang tidak terlihat
 * dari /api/health.
 */

import { one, query } from "./db";
import { WorkflowError } from "./workflow";

/**
 * Batas bagi berkas yang dikirim utuh dalam satu permintaan.
 *
 * Tiga megabita, dan alasannya bukan kolomnya melainkan jalannya: badan
 * permintaan di Vercel berhenti di 4,5 MB, sedangkan base64 membengkakkan
 * berkas sepertiga. Berkas 3 MB menjadi 4 MB di kawat — sudah mepet, dan
 * apa pun di atasnya diputus di tepi jaringan sebelum mencapai kode ini.
 */
export const BATAS_BYTE = 3 * 1024 * 1024;

/**
 * Batas bagi berkas yang datang bertahap, sepotong demi sepotong.
 *
 * Berkas yang dititipkan lewat /api/memos/bagian tidak pernah melewati batas
 * badan permintaan: tiap potongnya permintaan tersendiri, dan yang dirakit di
 * server sudah berupa Buffer. Karena itu batasnya tidak lagi ditentukan besar
 * satu permintaan, melainkan aturan aplikasi — sepuluh megabita, sama dengan
 * yang berlaku bagi lampiran memo.
 *
 * Dokumen full sign adalah pindaian belasan halaman bertanda tangan basah;
 * tiga megabita menolak hampir semuanya.
 */
export const BATAS_TITIPAN = 10 * 1024 * 1024;

/**
 * Jenis berkas yang diterima.
 *
 * Kwitansi dan Invoice datang sebagai pindaian atau foto ponsel, jadi PDF dan
 * gambar sudah mencakup semuanya. Daftar putih, bukan daftar hitam: berkas yang
 * jenisnya tidak dikenali ditolak, dan tidak ada jenis yang lolos hanya karena
 * belum sempat dipikirkan.
 */
export const JENIS_DITERIMA: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Butir lampiran yang diminta dari agent pada layar tanda tangan. */
export const BUTIR_LAMPIRAN = [
  "Kwitansi",
  "Invoice",
  "Dokumen pendukung lainnya",
];

export type BerkasMasuk = {
  checklist_item?: string;
  file_name?: string;
  content_type?: string;
  /** data URL (`data:application/pdf;base64,…`) atau base64 telanjang. */
  content_base64?: string;
};

/**
 * Yang ditentukan server, bukan yang mengirim berkas.
 *
 * Sengaja terpisah dari BerkasMasuk dan bukan sekadar medan tambahan padanya.
 * Dua jalur meneruskan badan permintaan apa adanya ke simpanLampiran() —
 * /api/claims/[id]/documents dan /api/signing-sessions/[token]/documents, yang
 * kedua bahkan publik — sehingga medan apa pun pada BerkasMasuk dapat dikarang
 * dari luar. `batas` yang dapat dikarang sama saja dengan tidak ada batas.
 */
export type OpsiBerkas = {
  /**
   * Isi berkas yang sudah berbentuk Buffer, bagi yang dikirim bertahap.
   *
   * Potongannya dirakit di server, jadi tidak ada data URL untuk dibaca dan
   * tidak ada base64 untuk diuraikan. Yang dipakai sebagai jenis berkasnya
   * `content_type` pada BerkasMasuk, sebab hanya itu yang ada.
   */
  buf?: Buffer;
  /** Batas ukuran; bawaannya BATAS_BYTE. Lihat BATAS_TITIPAN. */
  batas?: number;
};

/** Ubah muatan dari layar menjadi Buffer, sambil menolak yang tidak memenuhi syarat. */
export function bacaBerkas(p: BerkasMasuk, opsi: OpsiBerkas = {}) {
  const item = (p.checklist_item ?? "").trim();
  if (!item) {
    throw new WorkflowError("Jenis dokumen wajib dipilih.", "item_required", 422);
  }

  const batas = opsi.batas ?? BATAS_BYTE;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

  // Dua asal yang mungkin: base64 dari satu permintaan utuh, atau Buffer yang
  // sudah dirakit dari potongan-potongannya. Sesudah baris-baris ini keduanya
  // menempuh pemeriksaan yang sama persis — daftar putih dan batas ukuran
  // berlaku bagi keduanya, dan tidak ada jalan yang melewatinya.
  let tipe: string;
  let buf: Buffer;

  if (opsi.buf) {
    tipe = (p.content_type ?? "").toLowerCase().trim();
    buf = opsi.buf;
  } else {
    const raw = p.content_base64 ?? "";
    const koma = raw.indexOf(",");
    const dataUrl = raw.startsWith("data:");
    // Jenis diambil dari data URL bila ada; `content_type` yang dikirim terpisah
    // hanya cadangan. Keduanya sama-sama berasal dari peramban dan sama-sama dapat
    // dikarang — yang menjaga isinya tetap batas ukuran dan daftar putih ini.
    tipe = (dataUrl ? raw.slice(5, koma).split(";")[0] : p.content_type ?? "")
      .toLowerCase().trim();
    const base64 = dataUrl ? raw.slice(koma + 1) : raw;

    if (!base64) {
      throw new WorkflowError("Berkas belum dipilih.", "file_required", 422);
    }
    buf = Buffer.from(base64, "base64");
  }

  if (!JENIS_DITERIMA[tipe]) {
    throw new WorkflowError(
      `Jenis berkas '${tipe || "tidak dikenali"}' tidak diterima. ` +
      "Unggah PDF atau foto (JPG, PNG, WEBP, HEIC).",
      "file_type_rejected", 415);
  }

  if (!buf.length) {
    throw new WorkflowError("Berkas kosong.", "file_empty", 422);
  }
  if (buf.length > batas) {
    throw new WorkflowError(
      `Berkas ${mb(buf.length)} MB melebihi batas ${mb(batas)} MB. ` +
      "Perkecil pindaian atau kirim per halaman.",
      "file_too_large", 413);
  }

  const nama = (p.file_name ?? "").trim().split(/[\\/]/).pop() ||
               `${item.toLowerCase().replace(/\s+/g, "-")}.${JENIS_DITERIMA[tipe]}`;

  return { item, nama, tipe, buf };
}

export async function simpanLampiran(
  claimId: string, p: BerkasMasuk,
  meta: { source: string; uploadedBy: string | null } & OpsiBerkas,
) {
  // Opsinya dibaca dari meta, yang disusun pemanggil di server dan tidak
  // pernah berasal dari badan permintaan. Lihat OpsiBerkas.
  const { item, nama, tipe, buf } = bacaBerkas(p, meta);
  return one(
    `INSERT INTO claim_documents
       (claim_id, checklist_item, file_name, content, content_type, size_bytes,
        uploaded_by, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, checklist_item, file_name, content_type, size_bytes,
               source, uploaded_by, uploaded_at`,
    [claimId, item, nama, buf, tipe, buf.length, meta.uploadedBy, meta.source]);
}

/** Daftar lampiran tanpa isinya — isi berkas diambil satu per satu saat dibuka. */
export async function daftarLampiran(claimId: string) {
  return query(
    `SELECT id, checklist_item, file_name, content_type, size_bytes, source,
            uploaded_by, uploaded_at, (content IS NOT NULL) AS has_content
       FROM claim_documents WHERE claim_id=$1 ORDER BY uploaded_at`,
    [claimId]);
}
