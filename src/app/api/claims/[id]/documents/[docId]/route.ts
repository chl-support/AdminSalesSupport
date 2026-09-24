/**
 * Unduh — atau lihat — satu lampiran klaim.
 *
 * Bawaannya tetap unduhan: Content-Disposition attachment, karena pindaian yang
 * diunggah orang luar tidak dijalankan di origin yang sama dengan konsol. Nama
 * berkas ikut dibersihkan karena ia berasal dari peramban pengunggahnya.
 *
 * Dengan `?pratinjau=1` berkasnya ditampilkan inline. Tim pajak memeriksa
 * sepuluh lampiran per klaim; mengunduh sepuluh berkas ke folder Download lalu
 * membukanya satu per satu dari sana bukan pemeriksaan, itu pekerjaan rumah
 * tangga. Yang boleh tampil inline hanya jenis yang memang diterima
 * (lihat JENIS_DITERIMA): PDF dan gambar. HTML dan SVG — dua jenis yang dapat
 * menjalankan skrip di origin ini — tidak pernah masuk ke sini, dan bila suatu
 * saat masuk, ia tetap diunduh, bukan ditampilkan.
 *
 * Ditambah sandbox CSP dan nosniff: seandainya ada berkas yang lolos dengan
 * content-type keliru, peramban tetap tidak menjalankan apa pun darinya.
 */

import { handler, currentUser, body, requireRole } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { BATAS_TITIPAN, JENIS_DITERIMA, gantiLampiran } from "@/lib/lampiran";
import { rakitUnggah } from "@/lib/memo";
import { WorkflowError, getClaim } from "@/lib/workflow";

export const GET = handler(async (req, { params }) => {
  const { id, docId } = await params;
  await currentUser(req);
  const doc = await one(
    `SELECT file_name, content_type, content FROM claim_documents
      WHERE id=$1 AND claim_id=$2`, [docId, id]);
  if (!doc) throw new WorkflowError("Lampiran tidak ditemukan.", "not_found", 404);
  if (!doc.content) {
    throw new WorkflowError(
      "Lampiran ini tercatat sebelum isinya ikut disimpan; hanya namanya yang ada.",
      "content_missing", 410);
  }
  const nama = String(doc.file_name ?? "lampiran").replace(/[^\w.\- ]+/g, "_");
  const jenis = doc.content_type ?? "application/octet-stream";
  const inline = new URL(req.url).searchParams.get("pratinjau") === "1" &&
                 Object.prototype.hasOwnProperty.call(JENIS_DITERIMA, jenis);
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "content-type": jenis,
      "content-disposition":
        `${inline ? "inline" : "attachment"}; filename="${nama}"`,
      "content-length": String(doc.content.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    },
  });
});

/** Menulis berkas ke basis data; beri waktu yang cukup. */
export const maxDuration = 60;

/**
 * Lampiran yang boleh diganti pada klaim yang sudah disegel.
 *
 * Keduanya memang baru ada SESUDAH segelnya turun — dokumen full sign
 * diunggah pada tahap peredaran, bukti transfer pada pencatatan pembayaran —
 * jadi menggantinya tidak menyentuh apa pun yang diperiksa tim pajak maupun
 * yang ditandatangani Sales/Agent. Lampiran lain pada klaim bersegel tidak
 * dapat diganti dari sini: itu formulir yang sudah diverifikasi, dan
 * menukarnya diam-diam persis hal yang dicegah segelnya.
 */
const BOLEH_GANTI_BERSEGEL = ["dokumen_full_sign", "bukti_transfer"];

/**
 * Mengganti berkas sebuah lampiran — unggah ulang atas salah unggah.
 *
 * Bukti transfer klaim lain, halaman yang tertukar, pindaian yang ternyata
 * kosong: sebelum ini satu-satunya jalan membetulkannya adalah membatalkan
 * seluruh klaim dan mengulanginya dari awal, padahal yang keliru cuma satu
 * berkas.
 *
 * Yang lama tercatat di jejak audit beserta nama, jenis, dan besarnya. Isinya
 * tidak — ia benar-benar hilang, diganti yang baru. Itu memang yang diminta:
 * berkas yang salah tidak boleh tetap ada di dalam dokumen yang beredar.
 */
export const PUT = handler(async (req, { params }) => {
  const { id, docId } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);
  if (!p.content_base64 && !p.unggah_id) {
    throw new WorkflowError("Berkas penggantinya belum dipilih.",
                            "file_required", 422);
  }

  const klaim = await getClaim(id);
  const doc = await one<{ checklist_item: string }>(
    "SELECT checklist_item FROM claim_documents WHERE id=$1 AND claim_id=$2",
    [docId, id]);
  if (!doc) {
    throw new WorkflowError("Lampiran tidak ditemukan.", "not_found", 404);
  }
  if (klaim.sealed && !BOLEH_GANTI_BERSEGEL.includes(doc.checklist_item)) {
    throw new WorkflowError(
      "Dokumen ini bagian dari formulir yang sudah ditandatangani dan " +
      "disegel, jadi tidak dapat diganti. Yang dapat diganti pada klaim " +
      "bersegel hanya dokumen full sign dan bukti transfernya.",
      "sealed", 409);
  }

  // Titipan dirakit sesudah pemeriksaannya lolos, bukan sebelum: rakitUnggah()
  // membuang potongannya begitu selesai, jadi merakit lebih dulu lalu menolak
  // berarti berkas yang sudah susah payah dikirim hilang tanpa tersimpan.
  const titipan = p.unggah_id
    ? await rakitUnggah(String(p.unggah_id), user.username)
    : null;

  const { lama, baru } = await gantiLampiran(id, docId, {
    file_name: p.file_name ?? titipan?.file_name,
    content_type: titipan?.content_type ?? p.content_type,
    content_base64: titipan ? undefined : p.content_base64,
  }, {
    source: "ganti", uploadedBy: user.username,
    ...(titipan ? { buf: titipan.buf, batas: BATAS_TITIPAN } : {}),
  });

  await audit({
    entityType: "claim", entityId: id, action: "document_replace",
    actor: user.username,
    before: { item: lama.checklist_item, file: lama.file_name,
              content_type: lama.content_type, size_bytes: lama.size_bytes,
              uploaded_by: lama.uploaded_by, uploaded_at: lama.uploaded_at },
    after: { file: (baru as any).file_name,
             content_type: (baru as any).content_type,
             size_bytes: (baru as any).size_bytes },
  });
  return baru;
});
