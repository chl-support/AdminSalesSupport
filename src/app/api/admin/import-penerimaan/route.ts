import { handler, requireRole, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { imporPenerimaan } from "@/lib/penerimaan";

/**
 * Unggah Laporan Penerimaan Customer lewat konsol.
 *
 * Sejajar dengan unggah Laporan Penjualan, dan dibatasi sama: impor menyentuh
 * angka penerimaan seluruh proyek, dan angka itu menentukan besaran Komisi.
 *
 * `dry_run=true` membaca berkas dan melaporkan apa yang AKAN berubah tanpa
 * menulis apa pun.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_system");

  const form = await req.formData().catch(() => null);
  const berkas = form?.get("file");
  if (!berkas || typeof berkas === "string") {
    throw new WorkflowError("Berkas laporan belum dipilih.", "validation", 422);
  }

  const teks = await (berkas as File).text();
  if (!teks.trim()) {
    throw new WorkflowError("Berkas laporan kosong.", "validation", 422);
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "true";

  try {
    return await imporPenerimaan(teks, {
      dryRun, aktor: user.username, namaBerkas: (berkas as File).name,
      projectId: await projectAktif(req),
    });
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});
