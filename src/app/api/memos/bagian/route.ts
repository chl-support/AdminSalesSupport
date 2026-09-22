import { handler, currentUser } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { mulaiUnggah, simpanBagian } from "@/lib/memo";

/** Fungsi ini menulis potongan berkas ke basis data; beri waktu yang cukup. */
export const maxDuration = 60;

/**
 * Menerima satu potong berkas yang dikirim bertahap.
 *
 * Dipanggil berkali-kali untuk satu berkas. Panggilan pertama tidak menyertakan
 * unggah_id dan mendapatkannya sebagai jawaban; panggilan berikutnya
 * menyertakannya. Lihat mulaiUnggah() untuk alasan seluruh mekanisme ini ada.
 */
export const POST = handler(async (req) => {
  const user = await currentUser(req);

  const form = await req.formData().catch(() => null);
  const potong = form?.get("data");
  if (!potong || typeof potong === "string") {
    throw new WorkflowError("Potongan belum dipilih.", "file_required", 422);
  }

  const teks = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const id = teks("unggah_id") ?? await mulaiUnggah(
    teks("nama") ?? "memo", teks("tipe") ?? "application/octet-stream",
    user.username);

  const urutan = Number(teks("urutan") ?? "0");
  if (!Number.isInteger(urutan) || urutan < 0 || urutan > 9999) {
    throw new WorkflowError("Urutan potongan tidak sah.", "validation", 422);
  }

  const buf = Buffer.from(await (potong as File).arrayBuffer());
  await simpanBagian(id, urutan, buf, user.username);
  return { id };
});
