import { handler, requireRole, body } from "@/lib/api";
import { audit, one } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";

/**
 * Kolom Ket. pada lembar Detail Perhitungan, diisi tangan.
 *
 * Yang ditulis di sana keterangan pengajuan ini — "menunggu PPJB", "dibayar
 * bersama unit sebelah" — dan itu tidak ada sumbernya di basis data.
 * Keterangan unit yang sudah ada menerangkan unitnya, bukan pengajuannya;
 * dipakai untuk kolom ini, ia akan tercetak sama pada setiap pengajuan yang
 * menyentuh unit itu.
 *
 * Yang boleh mengisi Admin Sales, sama seperti isian tangan lain pada lembar
 * pengajuan. Boleh dikosongkan kembali: yang salah ketik harus dapat dihapus
 * tanpa mengarang penggantinya.
 */
export const POST = handler(async (req, { params }) => {
  const { id } = await params;
  const user = await requireRole(req, "admin_sales", "admin_system");
  const p = await body(req);

  const klaim = await one<any>("SELECT id FROM claims WHERE id=$1", [id]);
  if (!klaim) throw new WorkflowError("Klaim tidak ditemukan.", "not_found", 404);

  const isi = typeof p.keterangan === "string" ? p.keterangan.trim() : "";
  const nilai = isi ? isi.slice(0, 200) : null;

  await one<any>(
    "UPDATE claims SET detail_keterangan = $1 WHERE id = $2 RETURNING id",
    [nilai, id]);
  await audit({
    entityType: "claim", entityId: id, action: "detail_keterangan",
    actor: user.username, after: { detail_keterangan: nilai },
  });

  return { keterangan: nilai };
});
