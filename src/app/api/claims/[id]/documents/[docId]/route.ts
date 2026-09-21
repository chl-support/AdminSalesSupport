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

import { handler, currentUser } from "@/lib/api";
import { one } from "@/lib/db";
import { JENIS_DITERIMA } from "@/lib/lampiran";
import { WorkflowError } from "@/lib/workflow";

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
