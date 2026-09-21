import { handler, currentUser, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { simpanLampiran } from "@/lib/memo";

/**
 * Lampirkan berkas pendukung pada sebuah memo.
 *
 * Terbuka bagi semua peran yang sudah masuk, sama seperti mengunggah memonya:
 * yang memegang kwitansi atau dokumen transaksi belum tentu Admin IT.
 * Penghapusannya yang dibatasi.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await currentUser(req);
  const projectId = await projectAktif(req);

  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Berkas lampiran belum dipilih.",
                            "file_required", 422);
  }
  const f = berkas as File;
  const label = form?.get("label");

  return simpanLampiran(id, projectId, user.username, {
    label: typeof label === "string" ? label : null,
    file_name: f.name,
    content_type: f.type || "application/octet-stream",
    buf: Buffer.from(await f.arrayBuffer()),
  });
});
