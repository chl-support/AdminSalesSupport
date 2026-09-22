import { handler, currentUser, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { rakitUnggah, simpanLampiran } from "@/lib/memo";

/** Menulis berkas lampiran ke basis data; beri waktu yang cukup. */
export const maxDuration = 60;

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
  // Sama seperti memonya: berkas besar tiba sebagai titipan yang sudah
  // dikirim sepotong demi sepotong. Lihat mulaiUnggah() di @/lib/memo.
  const v = form?.get("unggah_id");
  const titipan = typeof v === "string" && v.trim() ? v.trim() : null;
  const berkas = form?.get("file");
  if (!titipan && (!berkas || typeof berkas === "string")) {
    throw new WorkflowError("Berkas lampiran belum dipilih.",
                            "file_required", 422);
  }
  const isi = titipan
    ? await rakitUnggah(titipan, user.username)
    : {
        buf: Buffer.from(await (berkas as File).arrayBuffer()),
        file_name: (berkas as File).name,
        content_type: (berkas as File).type || "application/octet-stream",
      };
  const label = form?.get("label");

  return simpanLampiran(id, projectId, user.username, {
    label: typeof label === "string" ? label : null,
    file_name: isi.file_name,
    content_type: isi.content_type,
    buf: isi.buf,
  });
});
