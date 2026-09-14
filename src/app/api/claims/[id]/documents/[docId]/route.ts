/**
 * Unduh satu lampiran klaim.
 *
 * Berkasnya dikirim apa adanya dengan Content-Disposition attachment, bukan
 * ditampilkan inline: pindaian yang diunggah orang luar tidak dijalankan di
 * origin yang sama dengan konsol. Nama berkas ikut dibersihkan karena ia berasal
 * dari peramban pengunggahnya.
 */

import { handler, currentUser } from "@/lib/api";
import { one } from "@/lib/db";
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
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "content-type": doc.content_type ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${nama}"`,
      "content-length": String(doc.content.length),
      "x-content-type-options": "nosniff",
    },
  });
});
