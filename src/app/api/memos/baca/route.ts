import { handler, currentUser } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { bacaMemo } from "@/lib/memo-baca";
import { periksaBerkas } from "@/lib/memo";

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
  await currentUser(req);

  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Berkas belum dipilih.", "file_required", 422);
  }
  const f = berkas as File;
  const buf = Buffer.from(await f.arrayBuffer());
  const tipe = f.type || "application/octet-stream";
  periksaBerkas(buf, tipe);

  return bacaMemo(buf, tipe, f.name);
});
