import { body, handler, projectAktif, requireRole } from "@/lib/api";
import { one } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";
import { mulaiDariAwal } from "@/lib/susun-pricelist-simpan";

/**
 * Mulai dari awal untuk project yang sedang dipilih: draf, riwayat, dan
 * pricelist tersimpan dihapus. Harus menyebut nama project-nya sebagai
 * konfirmasi. Admin Sales dan Admin IT.
 */
export const POST = handler(async (req) => {
  const user = await requireRole(req, "admin_sales", "admin_system");
  const projectId = await projectAktif(req);
  const p = await body<{ konfirmasi?: string; termasukBerlaku?: boolean }>(req);
  const proj = await one<{ name: string }>("SELECT name FROM projects WHERE id=$1", [projectId]);
  if (!proj || String(p.konfirmasi ?? "").trim().toLowerCase() !== proj.name.trim().toLowerCase()) {
    throw new WorkflowError(`Ketik nama project "${proj?.name ?? ""}" persis untuk konfirmasi.`, "validation", 422);
  }
  return await mulaiDariAwal(projectId, user.username, !!p.termasukBerlaku);
});
