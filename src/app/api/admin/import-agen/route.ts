import { handler, requireRole, projectAktif } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { imporAgen } from "@/lib/agen";

/**
 * Unggah Laporan Agent lewat konsol.
 *
 * Sejajar dengan dua impor lainnya, dan dibatasi sama: impor ini menyentuh
 * nomor telepon — tujuan kode verifikasi pendaftaran tanda tangan — dan
 * mencatat rekening tujuan pembayaran.
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
    return await imporAgen(teks, {
      dryRun, aktor: user.username, namaBerkas: (berkas as File).name,
      projectId: await projectAktif(req),
    });
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});
