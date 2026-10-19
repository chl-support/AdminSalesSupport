import { handler, projectAktif, requireRole } from "@/lib/api";
import { WorkflowError } from "@/lib/workflow";
import { berkasPricelist } from "@/lib/pricelist";
import { imporSusun } from "@/lib/susun-pricelist-xlsx";

/**
 * Buka pricelist tersimpan untuk diedit: berkas Excel-nya dibaca kembali
 * menjadi isian kelima langkah (pricelist hasil susunan membawa lembar
 * `_isian` sehingga terbaca utuh). Tidak menyimpan apa pun; pricelist
 * lamanya tetap di riwayat.
 */
export const GET = handler(async (req, { params }) => {
  const { id } = await params;
  await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const b = await berkasPricelist(id, projectId);
  if (!b) throw new WorkflowError("Berkas pricelist ini tidak tersimpan.", "not_found", 404);
  try {
    const isi = b.isi.buffer.slice(b.isi.byteOffset, b.isi.byteOffset + b.isi.byteLength) as ArrayBuffer;
    return { ...(await imporSusun(isi)), nama: b.nama.replace(/\.xlsx$/i, "") };
  } catch (e: any) {
    throw new WorkflowError(String(e?.message ?? e), "validation", 422);
  }
});
