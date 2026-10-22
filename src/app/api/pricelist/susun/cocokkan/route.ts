import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { bacaHargaExcel } from "@/lib/susun-pricelist-xlsx";

const BATAS = 5 * 1024 * 1024;

// Berkas PL besar butuh beberapa detik untuk dibaca.
export const maxDuration = 60;

/**
 * Baca angka hasil berkas Excel PL (harga per cara bayar dan Harga Setelah
 * Faktor) untuk dicocokkan dengan hitungan draf di layar. Tidak menyimpan
 * apa pun; pencocokannya di layar.
 */
export const POST = handler(async (req) => {
  await requireRole(req, "admin_sales", "admin_system");
  await projectAktif(req);
  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Berkas Excel belum dipilih.", "validation", 422);
  }
  if ((berkas as File).size > BATAS) {
    throw new WorkflowError("Berkas lebih dari 5 MB.", "validation", 422);
  }
  try {
    return await bacaHargaExcel(await (berkas as File).arrayBuffer());
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});
