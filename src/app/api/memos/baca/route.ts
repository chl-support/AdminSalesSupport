import { handler, currentUser } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { bacaMemo } from "@/lib/memo-baca";
import { lihatUnggah, periksaBerkas } from "@/lib/memo";

/** Membaca isi berkas; beri waktu yang cukup. */
export const maxDuration = 60;

/**
 * Baca memo yang baru dipilih, tanpa menyimpannya.
 *
 * Dipanggil begitu berkasnya dipilih di layar, sebelum tombol unggah ditekan.
 * Tidak ada satu baris pun yang tersentuh di basis data: yang dikembalikan
 * hanya usulan isian, dan yang mengunggah masih bebas mengubah atau
 * membatalkannya.
 *
 * Berkasnya tetap diperiksa dengan aturan yang sama seperti saat mengunggah —
 * batas ukuran dan jenis yang diterima. Berkas 40 MB yang akan ditolak pada
 * langkah berikutnya tidak ada gunanya dibaca lebih dulu.
 */
export const POST = handler(async (req) => {
  const user = await currentUser(req);

  const form = await req.formData().catch(() => null);
  const v = form?.get("unggah_id");
  const titipan = typeof v === "string" && v.trim() ? v.trim() : null;
  const berkas = form?.get("file");
  if (!titipan && (!berkas || typeof berkas === "string")) {
    throw new WorkflowError("Berkas belum dipilih.", "file_required", 422);
  }

  // Titipan TIDAK dibuang di sini. Pembacaan ini hanya mengusulkan isian;
  // berkasnya masih dibutuhkan utuh saat tombol unggah ditekan, dan mengirim
  // ulang seluruh potongannya berarti mengunggah dua kali untuk satu memo.
  const isi = titipan
    ? await lihatUnggah(titipan, user.username)
    : {
        buf: Buffer.from(await (berkas as File).arrayBuffer()),
        file_name: (berkas as File).name,
        content_type: (berkas as File).type || "application/octet-stream",
      };
  periksaBerkas(isi.buf, isi.content_type);

  return bacaMemo(isi.buf, isi.content_type, isi.file_name);
});
