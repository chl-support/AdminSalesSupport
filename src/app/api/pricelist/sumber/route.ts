import { body, handler, projectAktif, requireRole } from "@/lib/api";
import { pilihSumberPricelist } from "@/lib/pricelist";
import { WorkflowError } from "@/lib/workflow";

/**
 * Pilih sumber pricelist yang berlaku: "susun" (angka dari layar Pricelist)
 * atau "unggah" (berkas Excel yang diunggah).
 *
 * Yang berpindah hanya penunjuknya — pricelist terbaru dari sumber itu
 * diberlakukan kembali. Tidak ada angka yang dihitung ulang di sini, jadi
 * berpindah bolak-balik selalu mengembalikan angka yang sama.
 *
 * Dibatasi sama dengan mengunggah pricelist: harga yang berlaku menentukan
 * apa yang ditawarkan kepada konsumen.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const { sumber } = await body<{ sumber?: string }>(req);
  if (sumber !== "susun" && sumber !== "unggah") {
    throw new WorkflowError(
      'Sumber pricelist harus "susun" atau "unggah".', "validation", 422);
  }
  try {
    return await pilihSumberPricelist(projectId, sumber, user.username);
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});
